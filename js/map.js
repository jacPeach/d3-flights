// Variables
const zoomTransition = 750;
const minBub = 1;
const maxBub = 4;
const bubbleDist = 10;
const fadeTransition = 250;
const colorScheme = d3.interpolateOranges;
const topN = 10;
const ringRadius = 10;

async function createMap() {
  // Load data
  let dataset = await d3.csv("./data/parsed_incident_data.csv");
  const countriesGeo = await d3.json(
    "./data/world-administrative-boundaries-fixed.geo.json"
  );
  const idAccessor = (d) => d.properties.iso3;
  const dateParser = d3.timeParse("%Y-%m-%d");

  // Accessor from country code to number of incidents departing from there
  const numDepartingCountries = d3.rollup(
    dataset,
    (v) => v.length,
    (d) => d.Departure_Code
  );
  const colorMetricAccessor = (d) => numDepartingCountries.get(idAccessor(d));
  const numDestinationCountries = d3.rollup(
    dataset,
    (v) => v.length,
    (d) => d.Departure_Code,
    (d) => d.Destination_Code
  );
  // Accessor for country code to a centroid
  const countryPoint = {};
  countriesGeo.features.forEach((d) => {
    countryPoint[d.properties.iso3] = d.properties.geo_point_2d;
  });

  // Chart Dimensions
  let dimensions = {
    width: window.innerWidth * 0.8,
    margin: {
      top: 100,
      right: 10,
      bottom: 10,
      left: 10,
    },
  };
  dimensions.boundedWidth =
    dimensions.width - dimensions.margin.left - dimensions.margin.right;
  dimensions.height = dimensions.width * 0.6;
  dimensions.boundedHeight =
    dimensions.height - dimensions.margin.top - dimensions.margin.bottom;
  dimensions.xCenter = dimensions.margin.left + dimensions.boundedWidth / 2;
  dimensions.yCenter = dimensions.margin.top + dimensions.boundedHeight / 2;

  // Draw the canvas
  const wrapper = d3
    .select("#map-wrapper")
    .append("svg")
    .attr("width", dimensions.width)
    .attr("height", dimensions.height);
  const bounds = wrapper
    .append("g")
    .style(
      "transform",
      `translate(${dimensions.margin.left}px, ${dimensions.margin.top}px`
    );
  const map = bounds.append("g");
  const ringG = bounds.append("g");
  const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", zoomed);
  bounds.call(zoom).on("mousedown.zoom", null);

  // Create Scales
  const numDeparting = numDepartingCountries.values();
  const numDepartingExtent = d3.extent(numDeparting);
  const colorScale = d3
    .scaleSequential()
    .domain(numDepartingExtent)
    .interpolator(colorScheme);

  // Setup the geographical data
  const projection = d3
    .geoMercator()
    .scale(dimensions.boundedWidth / 2 / Math.PI)
    .rotate([-11, 0])
    .translate([
      dimensions.boundedWidth / 2,
      (dimensions.boundedHeight * 1.35) / 2,
    ])
    .precision(0.1);
  const pathGenerator = d3.geoPath(projection);
  const countries = map
    .selectAll(".country")
    .data(countriesGeo.features)
    .enter()
    .append("path")
    .attr("class", "country")
    .attr("d", pathGenerator)
    .attr("fill", (d) => {
      const metricVal = colorMetricAccessor(d);
      if (typeof metricVal === undefined) return "#e2e6e9";
      return colorScale(metricVal);
    })
    .attr("opacity", 1)
    .on("click", zoomIn);
  var transformF = "";

  // Define a function to plot the top ten destinations when one country is active
  function createRing(origin) {
    const originCode = idAccessor(origin);
    deleteRing();

    var topDestinations = Array.from(
      numDestinationCountries.get(originCode),
      ([name, value]) => ({
        name,
        value,
      })
    );
    const metricAccessor = (d) => d.value;
    // Lookup from code to value
    let countryMetricMap = {};
    topDestinations.forEach((d) => {
      countryMetricMap[d.name] = d.value;
    });
    topDestinations.sort((a, b) => metricAccessor(a) - metricAccessor(b));
    //Get the origin info out
    originVal = countryMetricMap[originCode];
    topDestinations = d3.filter(topDestinations, (d) => d.name !== originCode);
    topDestinations = topDestinations.slice(-topN - 1);
    // Add our origin
    topDestinations.push({ name: originCode, value: originVal });
    // Define a scale for the bubble radius
    const bubbleScale = d3
      .scaleLinear()
      .domain(
        d3.extent(
          topDestinations.filter((d) => d.name !== originCode),
          metricAccessor
        )
      )
      .range([minBub, maxBub]);

    let topDestNodes = [];
    let topDestLinks = [];
    const originPoint = [
      countryPoint[originCode][1],
      countryPoint[originCode][0],
    ];

    topDestinations.forEach((d) => {
      const o = originPoint;
      const dest = [countryPoint[d.name][1], countryPoint[d.name][0]];
      const scaledD = limitDistance(
        projection(o),
        projection(dest),
        bubbleDist
      );
      topDestNodes.push({
        type: "LineString",
        coordinates: [o, dest],
        properties: {
          dist: Math.sqrt((o[0] + scaledD[0]) ** 2 + (o[1] + scaledD[1]) ** 2),
          scaledCoord: scaledD,
        },
        id: d.name,
        x: scaledD[0],
        y: scaledD[1],
      });
      // Fix in place - center
      if (originCode === d.name) {
        topDestNodes[topDestNodes.length - 1].fx =
          topDestNodes[topDestNodes.length - 1].x;
        topDestNodes[topDestNodes.length - 1].fy =
          topDestNodes[topDestNodes.length - 1].y;
      }
      topDestLinks.push({
        source: originCode,
        target: d.name,
        value: 20,
      });
    });
    // Cut off a line at a set distance from the origin to place the bubbles
    function limitDistance(o, d, dis) {
      const oldA = d[0] - o[0];
      const oldB = d[1] - o[1];
      if (oldA === 0 && oldB == 0) return d;
      const oldDis = Math.sqrt(oldA ** 2 + oldB ** 2);
      const factor = dis / oldDis;
      const newA = oldA * factor;
      const newB = oldB * factor;
      return [o[0] + newA, o[1] + newB];
    }
    //Accessor functions
    const rAccessor = (d) =>
      d3.min([bubbleScale(countryMetricMap[d.id]), maxBub]);
    const xAccessor = (d) => d.properties.scaledCoord[0];
    const yAccessor = (d) => d.properties.scaledCoord[1];

    // Draws lines to each destination - replaced by bubbles
    // ringG
    //   .selectAll("path")
    //   .data(topLinks)
    //   .join("path")
    //   .attr("class", "link")
    //   .attr("d", pathGenerator)
    //   .attr("transform", transformF)
    //   .attr("opacity", 0)
    //   .transition()
    //   .delay(zoomTransition)
    //   .attr("opacity", 1);

    // Setup a force simulation - parameters give decent results
    const simulation = d3
      .forceSimulation(topDestNodes)
      .alphaMin(0.01)
      .velocityDecay(0.5)
      .alphaDecay(0.1)
      .force(
        "link",
        d3
          .forceLink()
          .id((d) => d.id)
          .distance((d) => ringRadius)
      )
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((d) => rAccessor(d))
          .iterations(2)
      )
      .on("end", endSim)
      .stop();
    simulation.force("link").links(topDestLinks);
    simulation.restart();

    const ring = ringG
      .append("circle")
      .attr("cx", projection(originPoint)[0])
      .attr("cy", projection(originPoint)[1])
      .attr("r", ringRadius)
      .attr("class", "ring")
      .attr("opacity", 0);
    const bubbles = ringG
      .selectAll("circle:not(.ring)")
      .data(topDestNodes)
      .join("circle")
      .attr("class", "bubble")
      .attr("cx", xAccessor)
      .attr("cy", yAccessor)
      .attr("r", rAccessor)
      .attr("opacity", 0);

    function endSim() {
      const tran = 500;
      bubbles
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y)
        .merge(ring)
        .transition()
        .delay(zoomTransition)
        .duration(tran)
        .attr("opacity", 1);
      ring.transition().delay(zoomTransition).duration(tran).attr("opacity", 1);
    }
  }
  function deleteRing() {
    // Called when no active countries
    ringG.selectAll("circle").remove();
    ringG.selectAll("path").remove();
  }

  // Add interaction
  // Zoom to clicked country
  var active = d3.select(null);
  function zoomIn(event, d) {
    if (active.node() == this || colorMetricAccessor(d) === undefined) {
      return resetZoom();
    }
    active.classed("active", false);
    active = d3.select(this).classed("active", true);
    // Get bounds of the country and zoom scale between limits
    const [[x0, y0], [x1, y1]] = pathGenerator.bounds(d),
      upper = 7,
      lower = 3;
    const scale = d3.max([
      d3.min([
        0.4 /
          Math.max(
            (x1 - x0) / dimensions.boundedWidth,
            (y1 - y0) / dimensions.boundedHeight
          ),
        upper,
      ]),
      lower,
    ]);
    // Fade out the other paths
    countries
      .transition()
      .duration(zoomTransition)
      .attr("transform", transformF)
      .attr("opacity", 1)
      .filter(":not(.active)")
      .transition()
      .duration(fadeTransition)
      .attr("opacity", 0.5);
    // Setup the zoom transform
    bounds
      .transition()
      .duration(zoomTransition)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(dimensions.boundedWidth / 2, dimensions.boundedHeight / 2)
          .scale(scale)
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
        d3.pointer(event, bounds.node())
      );
    // Finally run the simulation for the destination bubbles
    createRing(d);
  }
  function resetZoom() {
    deleteRing();
    active.classed("active", false);
    active = d3.select(null);

    // Fade back in
    countries.transition().duration(fadeTransition).attr("opacity", 1);
    // Zoom back out
    bounds
      .transition()
      .duration(zoomTransition)
      .call(
        zoom.transform,
        d3.zoomIdentity,
        d3
          .zoomTransform(bounds.node())
          .invert([dimensions.boundedWidth / 2, dimensions.boundedHeight / 2])
      );
  }
  function zoomed(event) {
    const { transform } = event;
    countries.attr("transform", transform);
    ringG.attr("transform", transform);
    countries.attr("stroke-width", 0.5 / transform.k);
  }
}

createMap();
