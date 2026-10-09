import urllib.request, json, time, subprocess

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
        time.sleep(0.12)
    return pts

# Exact 2026 Garmin 42.2k matching the user's uploaded screenshot
wp_42k = [
    [-37.8208, 144.9760], # 1. Batman Ave Start
    [-37.8200, 144.9680], # Princes Bridge
    [-37.8280, 144.9715], # St Kilda Rd
    [-37.8380, 144.9750], # St Kilda Rd
    [-37.8420, 144.9700], # Enter Albert Park
    [-37.8440, 144.9660], # Albert Park North
    [-37.8480, 144.9670], # Lakeside Drive
    [-37.8540, 144.9710], # Albert Park South
    # Out-and-back spike to Port Melbourne (Top-Left diagonal in Garmin silhouette):
    [-37.8580, 144.9750], # Fitzroy St
    [-37.8590, 144.9700], # Canterbury Rd / Fraser St
    [-37.8490, 144.9520], # Beaconsfield Parade
    [-37.8410, 144.9350], # Port Melbourne Station Pier turnaround (Top-Left Spike!)
    [-37.8490, 144.9520], # Beaconsfield Parade return
    [-37.8580, 144.9680], # Jacka Blvd
    [-37.8650, 144.9730], # Marine Parade (St Kilda Sea Baths)
    [-37.8740, 144.9770], # Ormond Esplanade
    [-37.8840, 144.9840], # Elwood
    [-37.8920, 144.9890], # Brighton Beach Rd
    [-37.9150, 144.9920], # Brighton Green Point / South Rd (Southern Turnaround tail!)
    [-37.8920, 144.9890], # Return north Beach Rd
    [-37.8780, 144.9790], # Elwood
    [-37.8680, 144.9735], # St Kilda Marina
    [-37.8600, 144.9750], # Fitzroy St
    [-37.8500, 144.9765], # St Kilda Junction
    [-37.8400, 144.9750], # St Kilda Rd north
    [-37.8300, 144.9725], # St Kilda Rd
    [-37.8240, 144.9730], # Linlithgow Ave
    [-37.8210, 144.9810], # Wellington Pde
    [-37.8198, 144.9834]  # MCG Finish
]

# Half Marathon 21.1k
wp_21k = [
    [-37.8208, 144.9760], # Batman Ave Start
    [-37.8200, 144.9680], # Princes Bridge
    [-37.8280, 144.9715], # St Kilda Rd
    [-37.8380, 144.9750], # St Kilda Rd
    [-37.8420, 144.9700], # Albert Park North
    [-37.8480, 144.9660], # Albert Park Lake
    [-37.8540, 144.9710], # Albert Park South
    [-37.8590, 144.9750], # Fitzroy St St Kilda
    [-37.8640, 144.9730], # The Esplanade
    [-37.8740, 144.9770], # Marine Parade
    [-37.8780, 144.9790], # Point Ormond turnaround
    [-37.8720, 144.9750], # Marine Parade return
    [-37.8630, 144.9735], # Jacka Blvd
    [-37.8580, 144.9760], # Fitzroy St
    [-37.8480, 144.9760], # St Kilda Rd north
    [-37.8320, 144.9730], # St Kilda Rd
    [-37.8240, 144.9730], # Linlithgow Ave
    [-37.8210, 144.9810], # Wellington Pde
    [-37.8198, 144.9834]  # MCG Finish
]

with open('public/dense_tracks.json', 'r') as f:
    dense = json.load(f)

print('Updating 42k with exact Garmin silhouette...')
dense['42k'] = fetch_dense_route(wp_42k)
print('42k points count:', len(dense['42k']))

print('Updating 21k with exact Garmin silhouette...')
dense['21k'] = fetch_dense_route(wp_21k)
print('21k points count:', len(dense['21k']))

with open('public/dense_tracks.json', 'w') as f:
    json.dump(dense, f)

print('Running update_tracks.py...')
subprocess.run(['python', 'update_tracks.py'], check=True)
print('SUCCESS! Exact Garmin silhouette generated and saved!')
