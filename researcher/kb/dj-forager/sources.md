# DJ Forager — Source APIs

## Classical
- Musopen: https://api.musopen.org/recordings?format=mp3&limit=10&license=by,by-nc,cc0
- Internet Archive: https://archive.org/advancedsearch.php?q=subject:classical+mediatype:audio+format:MP3

## Downtempo / Electronica
- Free Music Archive: https://freemusicarchive.org/api/get/tracks.json?genre_id=98&limit=10&page=1&api_key=free
- ccMixter: http://ccmixter.org/api/query?tags=downtempo&limit=10&type=remix

## BPM targets
- Classical: 40-120 BPM
- Downtempo / Deep House: 70-110 BPM
- Safe stretch ratio: 0.6-1.6x (dj_stretch.py rejects outside this range)
