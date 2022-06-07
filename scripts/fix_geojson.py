import json


input_file = "data/world-administrative-boundaries.geo.json"

output_file = "data/world-administrative-boundaries-fixed.geo.json"


with open(input_file, "r") as infile:

    map = json.load(infile)


no_of_regions = len(map["features"])

for i in range(no_of_regions):

    region_type = map["features"][i]["geometry"]["type"]

    if region_type == "Polygon":

        no_of_blocks = len(map["features"][i]["geometry"]["coordinates"])

        for j in range(no_of_blocks):

            coordinates_list = []

            no_of_coordinates = len(map["features"][i]["geometry"]["coordinates"][j])

            for k in range(no_of_coordinates):

                coordinates_list.append(
                    map["features"][i]["geometry"]["coordinates"][j][k]
                )

            coordinates_list.reverse()

            map["features"][i]["geometry"]["coordinates"][j] = coordinates_list

    elif region_type == "MultiPolygon":

        no_of_polygons = len(map["features"][i]["geometry"]["coordinates"])

        for j in range(no_of_polygons):

            no_of_blocks = len(map["features"][i]["geometry"]["coordinates"][j])

            for k in range(no_of_blocks):

                coordinates_list = []

                no_of_coordinates = len(
                    map["features"][i]["geometry"]["coordinates"][j][k]
                )

                for l in range(no_of_coordinates):

                    coordinates_list.append(
                        map["features"][i]["geometry"]["coordinates"][j][k][l]
                    )

                coordinates_list.reverse()

                map["features"][i]["geometry"]["coordinates"][j][k] = coordinates_list


with open(output_file, "w") as outfile:

    json.dump(map, outfile, indent=2)
