async function createTimeline(startYear, endYear) {
  // Load data
  let dataset = await d3.csv("./data/parsed_incident_data.csv");
  const dateParser = d3.timeParse("%Y-%m-%d");
  const xAccessorInit = (d) => dateParser(d.Incident_Date);
  const yAccessorInit = (d) => d.Fatalities;
  dataset = d3.flatRollup(
    dataset,
    (v) => d3.sum(v, (d) => yAccessorInit(d)),
    (d) => xAccessorInit(d)
  );
  const xAccessor = (d) => d[0];
  const yAccessor = (d) => d[1];
  dataset = dataset
    .filter(
      (d) =>
        startYear <= xAccessor(d).getYear() + 1900 &&
        xAccessor(d).getYear() + 1900 <= endYear
    )
    // .filter((d) => yAccessor(d) > 0)
    .sort((a, b) => xAccessor(a) - xAccessor(b));

  // Build chart dimensions
  let dimensions = {
    width: window.innerWidth * 0.8,
    margin: {
      top: 10,
      right: 10,
      bottom: 20,
      left: 60,
    },
  };
  dimensions.boundedWidth =
    dimensions.width - dimensions.margin.left - dimensions.margin.right;
  dimensions.height = dimensions.width * 0.3;
  dimensions.boundedHeight =
    dimensions.height - dimensions.margin.top - dimensions.margin.bottom;

  // Draw the canvas
  const wrapper = d3
    .select("#timeline-wrapper")
    .append("svg")
    .attr("width", dimensions.width)
    .attr("height", dimensions.height);
  const bounds = wrapper
    .append("g")
    .style(
      "transform",
      `translate(${dimensions.margin.left}px, ${dimensions.margin.top}px`
    );
  bounds
    .append("defs")
    .append("clipPath")
    .attr("id", "bounds-clip-path")
    .append("rect")
    .attr("width", dimensions.boundedWidth)
    .attr("height", dimensions.boundedHeight);
  const clip = bounds.append("g").attr("clip-path", "url(#bounds-clip-path)");
  clip.append("path").attr("class", "line");

  // Build the scales
  let xScale = d3
    .scaleTime()
    .domain(d3.extent(dataset, xAccessor))
    .range([0, dimensions.boundedWidth]);
  let yScale = d3
    .scaleLinear()
    .domain(d3.extent(dataset, yAccessor))
    .range([dimensions.boundedHeight, 0])
    .nice();

  // Draw the data
  // Line for the timeline
  const lineGenerator = d3
    .line()
    // .curve(d3.curveCatmullRom)
    .x((d) => xScale(xAccessor(d)))
    .y((d) => yScale(yAccessor(d)));
  const line = bounds.select(".line").attr("d", lineGenerator(dataset));
  // Also add circles for each datapoint
  const points = bounds
    .selectAll("circle")
    .data(dataset.filter((d) => yAccessor(d) > 0))
    .enter()
    .append("circle")
    .attr("cx", (d) => xScale(xAccessor(d)))
    .attr("cy", (d) => yScale(yAccessor(d)))
    .attr("r", 2)
    .attr("class", "point");
  function updatePoints(dataset) {
    points
      .data(dataset.filter((d) => yAccessor(d) > 0))
      .transition()
      .duration(1000)
      .attr("cx", (d) => xScale(xAccessor(d)))
      .attr("cy", (d) => yScale(yAccessor(d)));
  }

  // Draw axes etc.
  const xAxisGenerator = d3.axisBottom().scale(xScale);
  const xAxis = bounds
    .append("g")
    .attr("class", "x-axis")
    .style("transform", `translateY(${dimensions.boundedHeight}px)`)
    .call(xAxisGenerator);

  const yAxisGenerator = d3.axisLeft().scale(yScale);
  const yAxis = bounds.append("g").attr("class", "y-axis").call(yAxisGenerator);
  const yAxisLabel = yAxis
    .append("text")
    .attr("class", "y-axis-label")
    .attr("x", -dimensions.boundedHeight / 2)
    .attr("y", -dimensions.margin.left + dimensions.margin.left * 0.25)
    .html("Number of Fatalities");

  // Add interaction

  // Brushing to zoom
  const brush = d3
    .brushX()
    .extent([
      [0, 0],
      [dimensions.boundedWidth, dimensions.boundedHeight],
    ])
    .on("end", updateChart);
  bounds.append("g").attr("class", "brush").call(brush);
  let idleTimeout = null;
  let idled = () => {
    idleTimeout = null;
  };
  function updateChart(event) {
    const extent = event.selection;
    if (!extent) {
      if (!idleTimeout) return (idleTimeout = setTimeout(idled, 350));
      xScale.domain(d3.extent(dataset, xAccessor));
      yScale.domain(d3.extent(dataset, yAccessor)).nice();
    } else {
      const minX = xScale.invert(extent[0]);
      const maxX = xScale.invert(extent[1]);
      xScale.domain([minX, maxX]);
      yScale
        .domain(
          d3.extent(
            dataset.filter((d) => minX <= xAccessor(d) && xAccessor(d) <= maxX),
            yAccessor
          )
        )
        .nice();
      bounds.select(".brush").call(brush.move, null);
    }
    xAxis.transition().duration(1000).call(d3.axisBottom(xScale));
    yAxis.transition().duration(1000).call(d3.axisLeft(yScale));
    bounds
      .select(".line")
      .transition()
      .duration(1000)
      .attr("d", lineGenerator(dataset));
    updatePoints(dataset);
  }

  // Add a tooltip
  // Use the brush area as the listening rectangle
  bounds
    .select(".brush")
    .on("mousemove", onMouseMove)
    .on("mouseleave", onMouseLeave);

  const tooltip = d3.select("#timeline-tooltip");
  // Add an invisible circle to highlight the relevant point
  const tooltipCircle = bounds
    .append("circle")
    .attr("class", "tooltip-circle")
    .attr("r", 4)
    .style("opacity", 0);

  // Function to update tooltip location to the closest point
  function onMouseMove(event) {
    const mousePos = d3.pointer(event);
    const hoveredDate = xScale.invert(mousePos[0]);
    const getDistanceFromHoveredDate = (d) =>
      Math.abs(xAccessor(d) - hoveredDate);
    const closestIndex = d3.scan(
      dataset, //.filter((d) => yAccessor(d) > 0),
      (a, b) => getDistanceFromHoveredDate(a) - getDistanceFromHoveredDate(b)
    );
    const closestDataPoint = dataset[closestIndex];
    const closestX = xAccessor(closestDataPoint);
    const closestY = yAccessor(closestDataPoint);
    tooltipCircle
      .attr("cx", xScale(closestX))
      .attr("cy", yScale(closestY))
      .style("opacity", 1);

    const x = xScale(closestX) + dimensions.margin.left;
    const y = yScale(closestY) + dimensions.margin.top;
    const formatDate = d3.timeFormat("%d %b %Y");
    tooltip.select("#date").text(formatDate(closestX));
    // Use the closestYValue to set the temperature in our tooltip
    tooltip.select("#num-fatalities").text(`${closestY} Fatalities`);
    tooltip
      .style(
        "transform",
        `translate(calc(-50% + ${
          mousePos[0] + dimensions.margin.left
        }px), calc(-100% + ${mousePos[1] + dimensions.margin.top}px))`
      )
      .style("opacity", 1);
  }
  function onMouseLeave() {
    d3.select(".tooltip").style("opacity", 0);
    d3.select(".tooltip-circle").style("opacity", 0);
  }
}

createTimeline(2010, 2022);
