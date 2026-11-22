# TODO – przed oddaniem

## Formalności (sekcja 4.1 zadania)
- [x] Wpisać nazwę zespołu (bez imion i nazwisk) w `README.md`, `docs/zgloszenie.md` i na slajdzie 1 (`docs/prezentacja/deck.html`, potem przegenerować PDF)
- [x] Wersja online przez ngrok: https://headwear-composure-upbeat.ngrok-free.dev (wymaga włączonego komputera z backendem, frontendem i ngrok)
- [ ] Udostępnić prywatne repozytorium jury (instrukcja na Platformie)
- [ ] Nagrać film do 3 min według `docs/film.md`, wpisać link
- [ ] Sprawdzić `docs/prezentacja.pdf` (10 slajdów) i `docs/raporty/*.pdf`
- [ ] Wkleić teksty z `docs/zgloszenie.md` na Platformę

## Ryzyka do decyzji
- [ ] **react-leaflet ma licencję Hippocratic-2.1** (nie permisywna) – rozważyć zamianę na czysty Leaflet (BSD-2) w `ParcelMap`, `FieldsMap`, `WaterCard` (~2–3 h)
- [ ] Na serwerze docelowym uruchomić `python -m scripts.prewarm_weather` (zapas pogody NASA POWER, ~3 min)
- [ ] Demo z hotspota: sieć wydarzenia bywa limitowana przez GUGiK i Open-Meteo

## Później
- [ ] Prognoza ryzyka suszy na resztę sezonu (`docs/plan-prognoza.md`)
- [ ] Wspólne zastawki: działki przy tym samym rowie
- [ ] Przełącznik podkładu mapy: ortofotomapa / OpenStreetMap
- [ ] Walidacja pogody ze stacjami IMGW
