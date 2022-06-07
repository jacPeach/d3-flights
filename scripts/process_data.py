import json
from pathlib import Path
import pandas as pd
import numpy as np

date_parser = lambda x: pd.to_datetime(x, format="%d-%b-%Y", errors="coerce")
df = pd.read_csv(
    "data\\Aircraft_Incident_Dataset.csv",
    parse_dates=["Incident_Date"],
    date_parser=date_parser,
)

# Only care about these columns - and rows where a date is available
cols = [
    "Incident_Date",
    "Incident_Category",
    "Departure_Airport",
    "Destination_Airport",
    "Aircaft_Nature",
    "Fatalities",
]
ddf = df[cols].dropna(subset="Incident_Date").copy()
# Try and parse the country rom the airport
ddf["Departure_Country"] = ddf["Departure_Airport"].apply(lambda x: x.split(" , ")[-1])
ddf["Destination_Country"] = ddf["Destination_Airport"].apply(
    lambda x: x.split(" , ")[-1]
)
# Add a flag for international trips
ddf["International"] = np.where(
    ddf["Departure_Country"] == ddf["Destination_Country"], 0, 1
)
# Also remove any that don't have a country associated with them
ddf = ddf[
    ~ddf["Departure_Country"].isin(["?", "-"])
    & ~ddf["Destination_Country"].isin(["?", "-"])
]

# Change some of the categories to simpler descriptions
ddf.Incident_Category = ddf.Incident_Category.apply(lambda x: x.split(" | ")[0])
ddf["Aircaft_Nature"] = np.where(
    ddf["Aircaft_Nature"].str.contains("Passenger"), "Passenger", ddf["Aircaft_Nature"]
)
ddf["Aircaft_Nature"] = np.where(
    ~ddf["Aircaft_Nature"].isin(["Passenger", "Cargo", "Military"]),
    "Other",
    ddf["Aircaft_Nature"],
)
ddf = (
    ddf.reset_index(drop=True)
    .reset_index()
    .rename(columns={"index": "Accident_ID", "Aircaft Nature": "Aircraft"})
)

# Get the country codes
class def_dict(dict):
    def __missing__(self, key):
        return key


a_replacer = def_dict(
    {
        "U.S. Minor Outlying Islands": "United States of America",
        "Curaçao": "Caribbean Netherlands",
        "Scottsdale Airport, AZ (KSDL)": "United States of America",
    }
)
b_replacer = def_dict(
    {
        "Brunei Darussalam": "Brunei",
        r"CÃ´te d'Ivoire": "Cote d'Ivoire",
        "Falkland Islands (Malvinas)": "Falkland Islands",
        "Iran (Islamic Republic of)": "Iran",
        "Lao People's Democratic Republic": "Laos",
        "Macao": "Macau",
        "Micronesia (Federated States of)": "Micronesia",
        "Moldova, Republic of": "Moldova",
        "Democratic People's Republic of Korea": "North Korea",
        "The former Yugoslav Republic of Macedonia": "North Macedonia",
        "Russian Federation": "Russia",
        "Saint Vincent and the Grenadines": "Saint Vincent & the Grenadines",
        "Republic of Korea": "South Korea",
        "Saint Kitts and Nevis": "St. Kitts & Nevis",
        "Syrian Arab Republic": "Syria",
        "Timor-Leste": "East Timor",
        "United Republic of Tanzania": "Tanzania",
        "Trinidad and Tobago": "Trinidad & Tobago",
        "Turks and Caicos Islands": "Turks & Caicos Islands",
        "U.K. of Great Britain and Northern Ireland": "United Kingdom",
        "United States Virgin Islands": "U.S. Virgin Islands",
        "Sao Tome and Principe": "São Tomé & Príncipe",
        "Netherlands Antilles": "Caribbean Netherlands",
        "Swaziland": "Eswatini",
        "Libyan Arab Jamahiriya": "Libya",
    }
)

with open(Path("data", "world-administrative-boundaries.geo.json")) as f:
    ids = json.load(f)
ids = pd.DataFrame([x["properties"] for x in ids["features"]])[["name", "iso3"]]
# Fixes
ddf["Departure_Country"] = (
    ddf["Departure_Country"].str.replace(" and ", " & ").map(a_replacer)
)
ddf["Destination_Country"] = (
    ddf["Destination_Country"].str.replace(" and ", " & ").map(a_replacer)
)
ids["name"] = ids["name"].map(b_replacer)
ddf = (
    ddf.merge(ids, left_on="Departure_Country", right_on="name", how="left")
    .drop(columns="name")
    .rename(columns={"iso3": "Departure_Code"})
)
ddf = (
    ddf.merge(ids, left_on="Destination_Country", right_on="name", how="left")
    .drop(
        columns=[
            "name",
            "Destination_Country",
            "Departure_Country",
            "Departure_Airport",
            "Destination_Airport",
        ]
    )
    .rename(columns={"iso3": "Destination_Code"})
    .dropna()
)

ddf.to_csv("data\\parsed_incident_data.csv", index=False)
