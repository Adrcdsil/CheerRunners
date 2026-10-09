import urllib.request, json, time, math

def haversine(c1, c2):
    R = 6371.0
    lat1, lon1 = math.radians(c1[0]), math.radians(c1[1])
    lat2, lon2 = math.radians(c2[0]), math.radians(c2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

def total_dist(coords):
    return sum(haversine(coords[i], coords[i+1]) for i in range(len(coords)-1))

def fetch_dense_route(waypoints):
    pts = []
    for i in range(len(waypoints) - 1):
        w1 = waypoints[i]
        w2 = waypoints[i+1]
        url = f'https://router.project-osrm.org/route/v1/driving/{w1[1]},{w1[0]};{w2[1]},{w2[0]}?overview=full&geometries=geojson'
        req = urllib.request.Request(url, headers={'User-Agent': 'CheerRunners/1.0'})
        try:
            resp = urllib.request.urlopen(req, timeout=12)
            data = json.loads(resp.read())
            coords = data['routes'][0]['geometry']['coordinates']
            for c in coords:
                lat, lon = round(c[1], 5), round(c[0], 5)
                if not pts or pts[-1] != [lat, lon]:
                    pts.append([lat, lon])
        except Exception as e:
            print(f'Error segment {i}:', e)
        time.sleep(0.1)
    return pts

# 1. Official 5k (Dairy Farmers 5km)
wp_5k = [
    [-37.8208, 144.9760], # Batman Ave Start
    [-37.8180, 144.9680], # Flinders St / Swanston St
    [-37.8200, 144.9685], # Princes Bridge
    [-37.8240, 144.9700], # St Kilda Rd
    [-37.8285, 144.9715], # 2.5km Turnaround (Coventry St / Linlithgow Ave)
    [-37.8240, 144.9700], # St Kilda Rd return
    [-37.8200, 144.9685], # Princes Bridge return
    [-37.8175, 144.9740], # Flinders St / Wellington Pde
    [-37.8160, 144.9790], # Wellington Pde
    [-37.8210, 144.9810], # Brunton Ave
    [-37.8198, 144.9834]  # Finish Inside MCG
]

# 2. Official 10k (SriLankan Airlines 10km)
wp_10k = [
    [-37.8208, 144.9760], # Batman Ave Start
    [-37.8180, 144.9680], # Flinders St
    [-37.8200, 144.9685], # Princes Bridge
    [-37.8280, 144.9715], # St Kilda Rd
    [-37.8340, 144.9735], # St Kilda Rd / Domain Rd
    [-37.8360, 144.9770], # Domain Rd
    [-37.8375, 144.9830], # Domain Rd / Birdwood Ave (Tan Track corner)
    [-37.8320, 144.9820], # Birdwood Ave (Botanic Gardens perimeter)
    [-37.8280, 144.9780], # Dallas Brooks Dr / Linlithgow Ave
    [-37.8250, 144.9720], # Linlithgow Ave return to St Kilda Rd
    [-37.8320, 144.9730], # St Kilda Rd southward stretch (Km 5)
    [-37.8360, 144.9745], # St Kilda Rd Turnaround
    [-37.8280, 144.9715], # St Kilda Rd north
    [-37.8200, 144.9685], # Princes Bridge
    [-37.8160, 144.9790], # Wellington Pde
    [-37.8210, 144.9810], # Brunton Ave
    [-37.8198, 144.9834]  # Finish Inside MCG
]

# 3. Official 21km (Nike Half Marathon)
wp_21k = [
    [-37.8208, 144.9760], # Batman Ave Start
    [-37.8180, 144.9680], # Flinders St
    [-37.8200, 144.9685], # Princes Bridge
    [-37.8280, 144.9715], # St Kilda Rd
    [-37.8380, 144.9750], # St Kilda Rd (Km 5)
    [-37.8480, 144.9760], # St Kilda Rd
    [-37.8580, 144.9800], # St Kilda Junction
    [-37.8590, 144.9750], # Fitzroy St -> Albert Park entry
    [-37.8550, 144.9700], # Albert Park Lake South (Aughtie Dr)
    [-37.8500, 144.9650], # Aughtie Dr (Km 10)
    [-37.8420, 144.9630], # Albert Park Lake North (Albert Rd)
    [-37.8450, 144.9690], # Lakeside Dr (East side)
    [-37.8530, 144.9720], # Lakeside Dr
    [-37.8560, 144.9680], # Grand Prix South Loop
    [-37.8580, 144.9750], # Fitzroy St exit to St Kilda Junction
    [-37.8500, 144.9760], # St Kilda Rd north (Km 15)
    [-37.8380, 144.9750], # St Kilda Rd north
    [-37.8280, 144.9715], # St Kilda Rd north
    [-37.8200, 144.9685], # Princes Bridge
    [-37.8160, 144.9800], # Wellington Pde (Km 20)
    [-37.8210, 144.9810], # Brunton Ave
    [-37.8198, 144.9834]  # Finish Inside MCG
]

# 4. Official 42km (Nike Melbourne Marathon)
wp_42k = [
    # 1. Start & St Kilda Rd
    [-37.8208, 144.9760], # Batman Ave Start
    [-37.8180, 144.9680], # Flinders St
    [-37.8200, 144.9685], # Princes Bridge
    [-37.8280, 144.9715], # St Kilda Rd
    [-37.8380, 144.9750], # St Kilda Rd (Km 5)
    [-37.8580, 144.9800], # St Kilda Junction
    # 2. Coastal stretch south to Brighton
    [-37.8590, 144.9750], # Fitzroy St
    [-37.8630, 144.9730], # Jacka Blvd
    [-37.8700, 144.9760], # Marine Parade (Km 10)
    [-37.8800, 144.9820], # Ormond Esplanade
    [-37.8980, 144.9920], # Beach Rd Brighton (Km 15)
    [-37.9150, 144.9920], # Green Point / South Rd Brighton Turnaround
    # 3. Coastal stretch north back to St Kilda
    [-37.8980, 144.9920], # Beach Rd
    [-37.8800, 144.9820], # Ormond Esplanade
    [-37.8700, 144.9760], # Marine Parade
    [-37.8630, 144.9730], # Jacka Blvd (Km 20)
    # 4. Port Melbourne northwest spur
    [-37.8540, 144.9610], # Beaconsfield Parade
    [-37.8480, 144.9500], # Beaconsfield Parade (Km 25)
    [-37.8410, 144.9350], # Station Pier / Kerferd Rd Turnaround (Top-Left Spike)
    [-37.8480, 144.9500], # Beaconsfield Parade return
    [-37.8560, 144.9650], # Fraser St / Canterbury Rd entry to Albert Park
    # 5. Albert Park circuit
    [-37.8540, 144.9680], # Aughtie Dr
    [-37.8480, 144.9660], # Aughtie Dr (Km 30)
    [-37.8420, 144.9640], # Albert Park Lake North
    [-37.8480, 144.9720], # Lakeside Dr
    [-37.8560, 144.9750], # Albert Park exit to St Kilda Rd (Km 35)
    # 6. Return north up St Kilda Rd to MCG
    [-37.8480, 144.9760], # St Kilda Rd north
    [-37.8380, 144.9750], # St Kilda Rd north
    [-37.8280, 144.9715], # St Kilda Rd north
    [-37.8200, 144.9685], # Princes Bridge
    [-37.8160, 144.9800], # Wellington Pde (Km 40)
    [-37.8210, 144.9810], # Brunton Ave
    [-37.8198, 144.9834]  # Finish Inside MCG
]

print("Calculating routes from official maps...")
routes = {}
for name, wps in [('5k', wp_5k), ('10k', wp_10k), ('21k', wp_21k), ('42k', wp_42k)]:
    print(f"Fetching {name}...")
    coords = fetch_dense_route(wps)
    dist = total_dist(coords)
    print(f"  {name}: {len(coords)} points, ~{dist:.2f} km")
    routes[name] = coords

# Load existing dense_tracks to keep pakenham
with open('public/dense_tracks.json', 'r') as f:
    dense = json.load(f)

for k in ['5k', '10k', '21k', '42k']:
    dense[k] = routes[k]

with open('public/dense_tracks.json', 'w') as f:
    json.dump(dense, f)

print("Updated public/dense_tracks.json successfully!")
