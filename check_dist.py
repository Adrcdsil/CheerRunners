import urllib.request, json

wps = [
    [-37.8208, 144.9760],
    [-37.8180, 144.9680],
    [-37.8200, 144.9685],
    [-37.8285, 144.9715],
    [-37.8200, 144.9685],
    [-37.8160, 144.9790],
    [-37.8210, 144.9810],
    [-37.8198, 144.9834]
]
total = 0
for i in range(len(wps)-1):
    url = f"https://router.project-osrm.org/route/v1/foot/{wps[i][1]},{wps[i][0]};{wps[i+1][1]},{wps[i+1][0]}?overview=false"
    req = urllib.request.Request(url, headers={'User-Agent': 'CheerRunners/1.0'})
    d = json.loads(urllib.request.urlopen(req).read())
    dist = d['routes'][0]['distance']
    total += dist
    print(f"seg {i} -> {i+1}: {dist:.1f} m")

print(f"Total: {total:.1f} m")
