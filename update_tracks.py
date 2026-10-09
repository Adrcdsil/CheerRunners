import json

with open('public/dense_tracks.json', 'r') as f:
    dense = json.load(f)

# Write updated GPX files with real road tracks
def write_gpx(filepath, name, pts):
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="CheerRunners Live" xmlns="http://www.topografix.com/GPX/1/1">',
        f'  <metadata><name>{name}</name></metadata>',
        '  <trk>',
        f'    <name>{name}</name>',
        '    <trkseg>'
    ]
    for pt in pts:
        lines.append(f'      <trkpt lat="{pt[0]}" lon="{pt[1]}"/>')
    lines.extend([
        '    </trkseg>',
        '  </trk>',
        '</gpx>'
    ])
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

write_gpx('public/gpx/melbourne_marathon_5k.gpx', 'Melbourne Marathon Saturday 5k', dense['5k'])
write_gpx('public/gpx/melbourne_marathon_10k.gpx', 'Melbourne Marathon Saturday 10k', dense['10k'])
write_gpx('public/gpx/melbourne_marathon_21k.gpx', 'Melbourne Marathon Sunday 21.1k Half Marathon', dense['21k'])
write_gpx('public/gpx/melbourne_marathon_42k.gpx', 'Melbourne Marathon Sunday 42.2k Full Marathon', dense['42k'])
write_gpx('public/gpx/pakenham_lakeside_10k.gpx', 'Pakenham Lakeside 10k', dense['pakenham'])
print('Updated all 5 GPX files with thousands of street-accurate points!')

# Write course-data.js
js_content = f"""/**
 * CheerRunners - High-Density Road-Snapped Race Course Data
 * Over 6,700 street-level GPS points hugging the exact asphalt roads.
 */
window.COURSE_DATA = {{
    'MM SAT 5k 10k': {{
        title: 'Saturday Events (5k & 10k)',
        courses: [
            {{
                id: '5k',
                name: 'Saturday 5k Event',
                distanceKm: 5.0,
                color: '#ffb703',
                gpxFile: '/gpx/melbourne_marathon_5k.gpx',
                coordinates: {json.dumps(dense['5k'])}
            }},
            {{
                id: '10k',
                name: 'Saturday 10k Event',
                distanceKm: 10.0,
                color: '#00e676',
                gpxFile: '/gpx/melbourne_marathon_10k.gpx',
                coordinates: {json.dumps(dense['10k'])}
            }}
        ]
    }},
    'MM SUN 21k 42k': {{
        title: 'Sunday Events (21k & 42k)',
        courses: [
            {{
                id: '21k',
                name: 'Half Marathon (21.1k)',
                distanceKm: 21.1,
                color: '#ff6b6b', // Vermelho mais clarinho (Coral)
                gpxFile: '/gpx/melbourne_marathon_21k.gpx',
                coordinates: {json.dumps(dense['21k'])}
            }},
            {{
                id: '42k',
                name: 'Full Marathon (42.2k)',
                distanceKm: 42.2,
                color: '#ff4d6d', // Vermelho mais clarinho (Soft Crimson)
                gpxFile: '/gpx/melbourne_marathon_42k.gpx',
                coordinates: {json.dumps(dense['42k'])}
            }}
        ]
    }},
    'PAKENHAM RUN CLUB': {{
        title: 'Pakenham Lakeside Trail',
        courses: [
            {{
                id: 'pakenham',
                name: 'Lakeside Loop 10k',
                distanceKm: 10.0,
                color: '#00f2fe',
                gpxFile: '/gpx/pakenham_lakeside_10k.gpx',
                coordinates: {json.dumps(dense['pakenham'])}
            }}
        ]
    }},
    'RUN-2026': {{
        title: 'Social Run Club',
        courses: []
    }}
}};
"""

with open('public/js/course-data.js', 'w', encoding='utf-8') as f:
    f.write(js_content)
print('Updated public/js/course-data.js successfully!')
