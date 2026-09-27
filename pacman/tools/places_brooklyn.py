# Curated places for Pac-Manhattan: Brooklyn (north + west play area).
# Same format as places.py. The first landmark is where runs start.
# (name, lat, lon, fact) -- coordinates are approximate; the build step snaps them to the street graph.

LANDMARKS = [
 ("Grand Army Plaza", 40.6743, -73.9701, "Its Soldiers' and Sailors' Arch honors the Union forces of the Civil War."),
 ("Brooklyn Borough Hall", 40.6925, -73.9905, "Finished in 1848 as the city hall of the City of Brooklyn, before it joined New York."),
 ("Brooklyn Heights Promenade", 40.6962, -73.9977, "A walkway built on top of the Brooklyn-Queens Expressway."),
 ("Brooklyn Bridge Park", 40.7003, -73.9967, "Built on old shipping piers along the East River."),
 ("Jane's Carousel", 40.7043, -73.9922, "A restored 1922 carousel inside a glass pavilion."),
 ("Manhattan Bridge view on Washington Street", 40.7033, -73.9895, "The famous DUMBO photo spot framing the Manhattan Bridge."),
 ("Brooklyn Navy Yard", 40.7005, -73.9730, "A shipyard from 1801 to 1966 that built the USS Arizona."),
 ("Fort Greene Park", 40.6913, -73.9754, "Home to the Prison Ship Martyrs' Monument."),
 ("Barclays Center", 40.6826, -73.9754, "Home of the Brooklyn Nets since 2012."),
 ("Williamsburg Savings Bank Tower", 40.6852, -73.9785, "Brooklyn's tallest building for about 80 years after it opened in 1929."),
 ("Brooklyn Museum", 40.6712, -73.9636, "Its Beaux-Arts building opened in 1897."),
 ("Brooklyn Botanic Garden", 40.6694, -73.9624, "Famous for its cherry blossoms every spring."),
 ("Brooklyn Public Library Central Library", 40.6725, -73.9683, "Its entrance is covered with gilded figures from American literature."),
 ("Prospect Park Boathouse", 40.6607, -73.9656, "A terra-cotta boathouse from 1905 on the Lullwater."),
 ("Old Stone House", 40.6727, -73.9848, "A reconstruction of a 1699 Dutch farmhouse that saw the Battle of Brooklyn."),
 ("Green-Wood Cemetery", 40.6584, -73.9941, "Founded in 1838; its Battle Hill is one of the highest points in Brooklyn."),
 ("Valentino Pier", 40.6770, -74.0170, "A small Red Hook pier facing the Statue of Liberty."),
 ("Industry City", 40.6560, -74.0070, "An old waterfront industrial complex turned into shops and studios."),
 ("Domino Park", 40.7145, -73.9681, "Built where the Domino Sugar refinery stood."),
 ("Williamsburg Bridge", 40.7106, -73.9635, "When it opened in 1903 it was the longest suspension bridge in the world."),
 ("McCarren Park", 40.7206, -73.9510, "Its huge public pool opened in 1936 as a New Deal project."),
 ("Weeksville Heritage Center", 40.6749, -73.9275, "Preserves one of the largest free Black communities in 19th-century America."),
 ("Pratt Institute", 40.6913, -73.9637, "An art and design school founded in 1887."),
]

# (name, lat, lon, category, fact)  categories: R restaurant, M museum & culture, P park, L landmark
TARGETS = [
 # Restaurants
 ("Peter Luger Steak House", 40.7099, -73.9623, "R", "A Williamsburg steakhouse open since 1887."),
 ("Junior's", 40.6901, -73.9819, "R", "Famous for its cheesecake since 1950."),
 ("Juliana's", 40.7027, -73.9934, "R", "Coal-oven pizza in the shadow of the Brooklyn Bridge."),
 ("Grimaldi's", 40.7026, -73.9935, "R", "A DUMBO pizzeria known for its coal-fired oven."),
 ("Lucali", 40.6802, -74.0003, "R", "A candlelit pizzeria in Carroll Gardens."),
 ("Roberta's", 40.7050, -73.9336, "R", "A Bushwick pizzeria that opened in 2008."),
 ("Sahadi's", 40.6887, -73.9942, "R", "A Middle Eastern grocery on Atlantic Avenue since 1948."),
 ("Tom's Restaurant", 40.6745, -73.9631, "R", "A Prospect Heights diner open since 1936."),
 ("Brooklyn Brewery", 40.7217, -73.9573, "R", "A Williamsburg brewery founded in 1988."),
 # Museums & culture
 ("Brooklyn Museum", 40.6712, -73.9636, "M", "One of the largest art museums in the United States."),
 ("Brooklyn Children's Museum", 40.6745, -73.9440, "M", "The first children's museum in the world, founded in 1899."),
 ("New York Transit Museum", 40.6905, -73.9900, "M", "Housed inside a real 1936 subway station."),
 ("Brooklyn Academy of Music", 40.6861, -73.9778, "M", "Founded in 1861, one of the oldest performing arts centers in the country."),
 ("Center for Brooklyn History", 40.6947, -73.9926, "M", "A library and museum of Brooklyn's past in Brooklyn Heights."),
 ("Weeksville Heritage Center", 40.6749, -73.9275, "M", "Tells the story of a free Black community founded in the 1830s."),
 # Parks
 ("Long Meadow", 40.6660, -73.9727, "P", "One of the longest open meadows in any American city park."),
 ("Brooklyn Botanic Garden", 40.6694, -73.9624, "P", "Its Japanese Hill-and-Pond Garden opened in 1915."),
 ("McCarren Park", 40.7206, -73.9510, "P", "A Greenpoint and Williamsburg park with a 1936 pool."),
 ("Domino Park", 40.7145, -73.9681, "P", "A waterfront park with pieces of the old sugar refinery."),
 ("Transmitter Park", 40.7270, -73.9590, "P", "A Greenpoint park named for the radio station that once stood here."),
 ("Marsha P. Johnson State Park", 40.7218, -73.9616, "P", "Renamed in 2020 for the LGBTQ rights pioneer."),
 ("Sunset Park", 40.6479, -74.0040, "P", "Its hilltop has one of the best skyline views in Brooklyn."),
 ("Fort Greene Park", 40.6913, -73.9754, "P", "Brooklyn's first park, designed by Olmsted and Vaux."),
 # Landmarks
 ("Soldiers' and Sailors' Arch", 40.6737, -73.9700, "L", "The triumphal arch at Grand Army Plaza, dedicated in 1892."),
 ("Brooklyn Borough Hall", 40.6925, -73.9905, "L", "Brooklyn's city hall from 1848, when Brooklyn was its own city."),
 ("Jane's Carousel", 40.7043, -73.9922, "L", "A 1922 carousel restored and moved to the DUMBO waterfront."),
 ("Old Stone House", 40.6727, -73.9848, "L", "A Park Slope farmhouse site from the Battle of Brooklyn in 1776."),
 ("Williamsburg Savings Bank Tower", 40.6852, -73.9785, "L", "An Art Deco clock tower from 1929."),
 ("Valentino Pier", 40.6770, -74.0170, "L", "A Red Hook pier with a view of the Statue of Liberty."),
 ("Green-Wood Cemetery", 40.6584, -73.9941, "L", "A National Historic Landmark cemetery founded in 1838."),
]
