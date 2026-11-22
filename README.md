# Retentoor – asystent retencji wody dla rolnika

**HackNation 2026 · zadanie KOWR „Zatrzymaj wodę, chroń plony”**
Zespół: **AGH_BIT_OMEGA** · Wersja online: **https://headwear-composure-upbeat.ngrok-free.dev** (tunel ngrok; przy pierwszym wejściu kliknij „Visit Site”)

Rolnik podaje numer działki (albo klika ją na mapie), wybiera uprawę i datę. W kilka sekund dostaje raport: czy działce grozi susza, dlaczego, gdzie i ile wody może zatrzymać oraz kiedy nawadniać. Wszystko liczone na żywo z otwartych danych publicznych z ostatnich 10 lat.

![Raport Retentoor](docs/screens/02-raport-gora.png)

## Spis treści

- [W skrócie](#w-skrócie)
- [1. Instrukcja uruchomienia](#1-instrukcja-uruchomienia)
- [2. Funkcjonalności](#2-funkcjonalności)
- [3. Architektura](#3-architektura)
- [4. Źródła i zakresy danych](#4-źródła-i-zakresy-danych)
- [5. Dane pobierane na bieżąco i wcześniej](#5-dane-pobierane-na-bieżąco-i-wcześniej)
- [6. Biblioteki, usługi i narzędzia AI](#6-biblioteki-usługi-i-narzędzia-ai)
- [7. Licencje i warunki korzystania](#7-licencje-i-warunki-korzystania)
- [8. Znane ograniczenia](#8-znane-ograniczenia)
- [9. Weryfikacja wyników](#9-weryfikacja-wyników)
- [Skalowanie i koszty](#skalowanie-i-koszty)
- [Bezpieczeństwo i prywatność](#bezpieczeństwo-i-prywatność)
- [API](#api)
- [Struktura repozytorium](#struktura-repozytorium)

Dokumenty uzupełniające: [metodyka](docs/metodyka.md) · [źródła rekomendacji](docs/zrodla-rekomendacji.md) · [design system](docs/design-system.md) · [plan prognozy](docs/plan-prognoza.md) · [tekst zgłoszenia](docs/zgloszenie.md) · [plan prezentacji](docs/prezentacja.md) · [scenariusz filmu](docs/film.md) · [przykładowe raporty PDF](docs/raporty/)

---

## W skrócie

**Problem.** Susza rolnicza w Polsce powtarza się co kilka lat, a rolnik nie ma prostego narzędzia, które dla *jego* działki powie: jak jest z wodą teraz, jak często bywało źle i co konkretnie zrobić, zanim sięgnie po kosztowne nawadnianie. Dane istnieją (IUNG, GUGiK, Copernicus, reanalizy pogody), ale są rozproszone i wymagają wiedzy GIS.

**Rozwiązanie.** Aplikacja webowa w trzech krokach: **działka → uprawa → raport**. Raport odwzorowuje sekwencję z Załącznika naukowego KOWR: *ocena sytuacji wodnej → przyczyny → retencja krajobrazowa → retencja glebowa i agrotechnika → nawadnianie*.

**Jak wykorzystujemy dane.** Pięć kategorii, wszystkie darmowe i legalne: pogoda z 10 lat (Open-Meteo ERA5, zapasowo NASA POWER) i prognoza (Open-Meteo, zapasowo MET Norway), satelita (Sentinel-2 L2A), gleba (IUNG, SoilGrids), hydrologia (rowy BDOT10k, wody i mokradła IUNG, model spływu z NMT), dane przestrzenne (ULDK, NMT, ortofotomapa). Ocena suszy to metoda IUNG SMSR (KBW i progi z Dz.U. 2019 poz. 739), nawadnianie to bilans FAO-56.

**Korzyści dla rolnika.**
- Konkretne działania z miejscem na mapie i liczbami, np. „zastawka na rowie przy działce: ok. 530 m³ wody co sezon”.
- Widzi, którędy woda ucieka z pola i gdzie najlepiej ją zatrzymać.
- Wie, czy nawadniać dziś i ile (mm), z uwzględnieniem prognozy opadów.
- Każda liczba ma źródło, datę i poziom pewności – bez pozornej precyzji.
- Bez konta i bez danych osobowych; „Moje pola” zostają w przeglądarce.

---

## 1. Instrukcja uruchomienia

Wymagania: **Python 3.10+**, **Node.js 20+**. Nie są potrzebne żadne klucze API ani konta.

**Backend** (http://localhost:8000, dokumentacja API: http://localhost:8000/docs):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload
```

**Frontend** (http://localhost:5173 – serwer deweloperski przekierowuje `/api` na :8000):

```powershell
cd frontend
npm install
npm run dev
```

**Albo całość w Dockerze:** `docker compose up --build` (frontend na :5173, backend na :8000).

**Opcjonalnie:**

| Krok | Po co |
|---|---|
| `cd backend` i `.venv\Scripts\python -m scripts.prewarm_weather` | rozgrzewa zapasowe dane pogodowe NASA POWER dla całej Polski (194 komórki, ok. 3 min) – aplikacja liczy raporty nawet wtedy, gdy Open-Meteo limituje zapytania z danej sieci |
| plik `backend/.env` z `OPENMETEO_API_KEY=...` | płatny plan Open-Meteo zamiast darmowego (bez limitu per IP); bez klucza działa darmowe API |

**Testy:** `cd backend` i `.venv\Scripts\python -m pytest` (5 testów). Frontend: `npm run build` (sprawdzenie typów + build), `npx eslint src`.

**Przykładowe działki do sprawdzenia** (wpisz identyfikator w polu „Wskaż działkę”):

| Działka | Gdzie | Co pokazuje |
|---|---|---|
| `302111_5.0016.1/10` + kukurydza na ziarno + 10.07.2018 | Murowana Goślina (wielkopolskie), gleba lekka | bieżąca susza, nawadnianie zasadne, susza w 2–4 z 10 lat |
| `041704_2.0008.283` + zboża ozime + dziś | Płużnica (kujawsko-pomorskie) | rów przy działce, woda zbiera się w zagłębieniach, sezon z satelity |
| `200807_2.0012.162` + kukurydza na ziarno | Trzcianne (podlaskie), stok | 51% spływu ucieka na południe, 14 ha gruntów spływa na działkę |
| `260104_5.0016.78` | Pacanów (świętokrzyskie), gleba ciężka | mała, prawie płaska działka |

---

## 2. Funkcjonalności

**Wybór działki** – po identyfikatorze, kliknięciem na ortofotomapie z granicami działek i rowami melioracyjnymi, z „Mojej lokalizacji” albo przez wyszukanie miejscowości. Sprawdzenie użytkowania terenu (czy to grunt rolny).

![Wybór działki](docs/screens/01-start.png)

**Data analizy** – domyślnie dziś; dowolny dzień z ostatnich 10 lat (ocena wsteczna) albo do 16 dni naprzód (według prognozy pogody, oznaczonej w raporcie).

**Raport** (ekran, link do udostępnienia, druk i PDF):

1. **Ocena sytuacji wodnej** – werdykt w języku rolnika, bilans wodny (KBW) na tle progu suszy IUNG i mediany z 10 lat, decyzja o nawadnianiu z dawką.
   ![Ocena](docs/screens/03-ocena.png)
2. **Historia suszy z 10 lat** – w których latach i okresach był niedobór dla tej uprawy na tej glebie.
   ![Historia](docs/screens/04-historia.png)
3. **Przyczyny** – opady i temperatura, gleba, odpływ, wrażliwość uprawy; każda z dowodami liczbowymi.
4. **Woda na działce** – model spływu z NMT: którędy woda ucieka, gdzie się zbiera, ile gruntów spływa na pole, najlepsze miejsce na oczko; „ile wody zatrzymasz” w m³ dla każdego działania.
   ![Woda na działce](docs/screens/09-woda-pluznica.png)
5. **Co możesz zrobić** – rekomendacje w kolejności KOWR, z priorytetem, uzasadnieniem, podstawą naukową, formalnościami (Prawo wodne) i punktem na mapie.
   ![Rekomendacje](docs/screens/06-rekomendacje.png)
6. **Porównanie upraw** – jak często każda z 14 grup upraw miałaby suszę na tej działce.
7. **Satelita** – wilgotność (NDMI) i zieleń (NDVI) roślin z Sentinel-2 na tle tej samej pory roku w poprzednich latach, podgląd zdjęcia w kolorach naturalnych i mapy wilgotności, **animacja całego sezonu** z wykresem.
   ![Sezon z satelity](docs/screens/12-sezon.png)
8. **Wiarygodność i źródła** – poziom pewności, brakujące dane, ograniczenia, źródła z datą pobrania i licencją.

**Moje pola** – zapisane działki na jednej mapie, kolorowane według stanu wody, z ostatnim wynikiem, „Sprawdź wszystkie na dziś” i eksportem CSV. Zapis tylko w przeglądarce.

![Moje pola](docs/screens/15-moje-pola.png)

**Działania retencyjne** – katalog wszystkich działań, które aplikacja może zaproponować, z warunkami, kosztem orientacyjnym, formalnościami i ekoschematami.

**Źródła i metoda** – jak powstaje raport, stan usług na żywo, zasada poziomu pewności, tabela źródeł.

**Odporność na awarie** – baner, gdy GUGiK albo wszystkie źródła prognozy są niedostępne; automatyczne źródła zapasowe (NASA POWER, MET Norway); cache z serwowaniem starszej kopii przy awarii.

**Dostępność i urządzenia** – działa w Chrome, Edge, Firefox, Safari i Operze, na komputerze i telefonie; jasny i ciemny motyw; druk zawsze w jasnym motywie.

---

## 3. Architektura

```
Przeglądarka (React + TypeScript, Vite)                 Serwer (Python, FastAPI) – bezstanowy, bez bazy danych
┌──────────────────────────────────────┐   /api/analysis   ┌──────────────────────────────────────────────────────┐
│ Analiza działki: wyszukiwarka, mapa  │ ────────────────▶ │ ULDK → geometria działki                             │
│  (Leaflet: ortofotomapa, granice     │                   │ równolegle (asyncio + httpx, timeout na źródło):     │
│  KIEG, rowy BDOT10k), uprawa, data   │                   │  ├ IUNG WMS → kategoria gleby, otoczenie             │
│ Raport: werdykt, wykresy (Recharts), │ ◀──────────────── │  ├ Open-Meteo ERA5 / NASA POWER → 21 lat pogody      │
│  mapa spływu, sezon z satelity,      │    JSON raportu   │  ├ Open-Meteo / MET Norway → prognoza 16 dni         │
│  źródła; druk / PDF                  │                   │  ├ SoilGrids → tekstura, węgiel, AWC                 │
│ Moje pola (localStorage)             │  /api/analysis/   │  ├ GUGiK NMT → spadki, najniższy punkt               │
│ Działania retencyjne, Źródła i metoda│  runoff, satellite│  └ BDOT10k → rowy melioracyjne                       │
└──────────────────────────────────────┘  (osobno, wolniej)│ kbw.py (IUNG SMSR) → advisor.py (przyczyny, reguły,  │
                                                          │  FAO-56) → water_budget.py (m³)                      │
                                                          │ runoff.py (D8 na NMT), sentinel.py (STAC + COG)      │
                                                          │ cache.py: pliki JSON, TTL per źródło, starsza kopia  │
                                                          │  przy awarii, bezpiecznik na limity Open-Meteo       │
                                                          └──────────────────────────────────────────────────────┘
```

- **Raport główny** (`/api/analysis`) liczy się w 1–8 s (z cache poniżej 1 s). Wolniejsze części – satelita (pierwszy odczyt 10–25 s), sezon z satelity (~25 s), model spływu (~2,5 s) – ładują się osobno, więc raport pojawia się od razu.
- **Bez bazy danych.** Odpowiedzi usług zewnętrznych są zapisywane jako pliki JSON w `backend/data/cache/<źródło>/`. Raport nie jest przechowywany: link `/raport?dzialka=&uprawa=&data=` liczy go od nowa.
- **Odporność:** każde źródło opcjonalne ma timeout i staje się „brak danych” zamiast błędu; po nieudanym odświeżeniu serwer podaje starszą kopię (10 min przerwy przed kolejną próbą); po limicie 429 Open-Meteo jest pomijane przez 5 min dla wszystkich działek.
- **Frontend:** React 18, Tailwind 4, komponenty shadcn (Base UI), Leaflet, Recharts. Spójny system projektowy w [docs/design-system.md](docs/design-system.md).

Kluczowe moduły backendu (`backend/app/services/`): `uldk.py`, `iung.py`, `soilgrids.py`, `meteo.py`, `nasa_power.py`, `forecast.py`, `kbw.py`, `advisor.py`, `terrain.py`, `runoff.py`, `water_budget.py`, `ditches.py`, `surroundings.py`, `sentinel.py`, `cache.py`, `status.py`.

---

## 4. Źródła i zakresy danych

| Kategoria | Dane | Źródło | Zakres / rozdzielczość | Do czego |
|---|---|---|---|---|
| Przestrzenne | granice i atrybuty działki | **ULDK GUGiK** | stan bieżący ewidencji | geometria, powierzchnia, gmina |
| Przestrzenne | ortofotomapa, granice działek | **GUGiK** WMTS ORTO, KIEG WMS | bieżące | mapa wyboru działki |
| Przestrzenne | rzeźba terenu | **GUGiK NMT** (GetHByPointList) | NMT 1 m, próbkowany co 3–25 m | spadki, najniższy punkt, model spływu |
| Przestrzenne | wyszukiwanie miejscowości | **GUGiK UUG**, zapasowo OSM Nominatim | – | przesunięcie mapy |
| Meteorologiczne | opad, ET₀ FAO-56, temperatura | **Open-Meteo Historical** (ERA5 / ERA5-Land) | od 1 stycznia 21 lat wstecz do dziś, dziennie, ~9–25 km | KBW, historia susz, bilans wody |
| Meteorologiczne | jw. (zapas) | **NASA POWER** (MERRA-2) | jw., ~50 km; ET₀ liczone FAO-56 | gdy Open-Meteo niedostępne |
| Meteorologiczne | prognoza | **Open-Meteo Forecast**, zapasowo **MET Norway** | 16 dni / ~10 dni | ostatnie dni, opad na 7 dni, analiza na przyszłą datę |
| Glebowe | kategoria gleby I–IV, użytkowanie | **IUNG-PIB SMSR** (WMS `katgl_landuse2024`) | mapa krajowa | progi suszy KBW |
| Glebowe | piasek, ił, węgiel organiczny, AWC | **ISRIC SoilGrids 2.0** | 250 m, 0–30 cm | pojemność wodna gleby, przyczyny, bilans |
| Glebowe | progi suszy KBW | **IUNG-PIB**, Dz.U. 2019 poz. 739 | 14 upraw × 4 kategorie × 14 okresów | ocena suszy |
| Hydrologiczne | rowy melioracyjne i cieki | **GUGiK BDOT10k** (WMS + GetFeatureInfo) | baza topograficzna 1:10 000 | zastawki, odległość od rowu |
| Hydrologiczne | wody, lasy, gleby organiczne wokół działki | **IUNG-PIB** (warstwy SMSR) | promień ~1 km | retencja krajobrazowa |
| Hydrologiczne | spływ powierzchniowy | model D8 na **NMT GUGiK** (własny) | siatka 3–25 m | którędy woda ucieka, gdzie się zbiera |
| Satelitarne | Sentinel-2 L2A: B04, B8A, B11, SCL, TCI | **Copernicus** przez **Earth Search** (Element 84, AWS Open Data) | od 2017, co 2–5 dni, 10–20 m | NDVI, NDMI, porównanie z latami, animacja sezonu |

Metodyka obliczeń: [docs/metodyka.md](docs/metodyka.md).

---

## 5. Dane pobierane na bieżąco i wcześniej

**Wynik i rekomendacje zawsze liczy aplikacja w chwili zapytania**, z danych dla wskazanej działki i daty. Wcześniej przygotowane są tylko tabele referencyjne i opcjonalny zapas pogody.

**Pobrane lub przetworzone wcześniej:**

| Dane | Plik / miejsce | Kiedy | Źródło |
|---|---|---|---|
| Progi suszy KBW (14 upraw × 4 kategorie gleb × 14 okresów) | `backend/app/data/kbw_thresholds.json` | 21.11.2026 | susza.iung.pulawy.pl/progi/ (Dz.U. 2019 poz. 739) |
| Współczynniki Kc, głębokość korzeni Zr, frakcja p dla 14 upraw | `backend/app/services/advisor.py` (`CROP_PARAMS`) | 21.11.2026 | FAO-56, Table 12 i 22 (fao.org/4/x0490e), przypisane do polskiego kalendarza upraw |
| Zapas pogody NASA POWER dla siatki Polski (194 komórki, 2005–2026) | `backend/data/cache/nasa_power/` (poza repozytorium) | 22.11.2026, skrypt `scripts/prewarm_weather.py` | power.larc.nasa.gov |

**Pobierane na bieżąco (z cache):**

| Źródło | Ważność cache | Przy awarii |
|---|---|---|
| ULDK (działka), NMT, BDOT10k, IUNG, SoilGrids | bez wygasania (dane statyczne) | – |
| Open-Meteo Historical | 1 dzień | starsza kopia, potem NASA POWER |
| NASA POWER | 1 dzień | starsza kopia (rozgrzana siatka) |
| Prognoza Open-Meteo / MET Norway | 3 godziny | drugi dostawca |
| Sentinel-2: wyszukiwanie scen | przeszłe okresy bez wygasania, ostatnie dni 12 h | komunikat „niedostępne” w karcie |
| Sentinel-2: statystyki i obrazy działki | bez wygasania (scena się nie zmienia) | – |
| Wyszukiwanie miejscowości | 30 dni | Nominatim |

Każde źródło w raporcie ma datę i godzinę pobrania oraz zakres dat danych (sekcja „Wiarygodność i źródła”).

---

## 6. Biblioteki, usługi i narzędzia AI

### Narzędzia sztucznej inteligencji

- **W działaniu aplikacji nie ma modeli AI ani uczenia maszynowego.** Ocena, przyczyny i rekomendacje to jawne reguły i metody naukowe (IUNG SMSR, FAO-56, D8, mediany NDVI/NDMI). Dzięki temu każdy wynik da się odtworzyć i uzasadnić liczbami.
- **Przy tworzeniu kodu i dokumentacji** zespół korzystał z asystenta programistycznego **Claude Code (Anthropic)**: generowanie i refaktoryzacja kodu, analiza dokumentacji API, testy, zrzuty ekranu, teksty dokumentacji. Kod był przeglądany i testowany przez zespół; decyzje metodyczne (wybór metod, progów, źródeł) są opisane i uzasadnione w [docs/metodyka.md](docs/metodyka.md).
- **Warunki korzystania z Claude Code:** usługa Anthropic na zasadach regulaminu Anthropic (anthropic.com/legal). Prawa do wygenerowanych treści przysługują użytkownikowi, więc kod może zostać przeniesiony na KOWR bez dodatkowych ograniczeń licencyjnych. Narzędzie nie jest częścią aplikacji i nie jest potrzebne do jej uruchomienia.
- Plan na przyszłość: model prognozy KBW (SARIMAX / analogi klimatyczne) – [docs/plan-prognoza.md](docs/plan-prognoza.md). Nie jest częścią obecnej wersji.

### Backend (Python)

| Biblioteka | Wersja | Licencja | Do czego |
|---|---|---|---|
| FastAPI | 0.115.6 | MIT | API |
| Uvicorn | 0.34.0 | BSD-3-Clause | serwer ASGI |
| pydantic-settings | 2.7.1 | MIT | konfiguracja |
| httpx | 0.28.1 | BSD-3-Clause | zapytania do usług |
| pandas (+ NumPy) | 2.2.3 | BSD-3-Clause | szeregi pogodowe, KBW |
| Shapely | 2.0.6 | BSD-3-Clause | geometria działek |
| pyproj (PROJ) | 3.7.0 | MIT | układy współrzędnych (EPSG:2180) |
| rasterio (z GDAL) | 1.4.4 | BSD-3-Clause (GDAL: MIT) | odczyt COG Sentinel-2 |
| Pillow | 11.0.0 | MIT-CMU | obrazy satelitarne PNG |
| lxml | 5.3.0 | BSD-3-Clause | XML z usług OGC |
| pytest | 8.3.4 | MIT | testy |

### Frontend (TypeScript)

| Biblioteka | Wersja | Licencja | Do czego |
|---|---|---|---|
| React, React DOM | 18.3.1 | MIT | interfejs |
| React Router | 7.1.1 | MIT | nawigacja |
| Vite, @vitejs/plugin-react | 6.4.6 / 4.7.0 | MIT | build i serwer deweloperski |
| Tailwind CSS, @tailwindcss/vite, tw-animate-css | 4.3.5 / 1.4.0 | MIT | style |
| shadcn, @base-ui/react, class-variance-authority, cmdk | 4.23 / 1.9 / 0.7.1 / 1.1.1 | MIT / MIT / Apache-2.0 / MIT | komponenty UI |
| Leaflet | 1.9.4 | BSD-2-Clause | mapy |
| react-leaflet | 4.2.1 | **Hippocratic-2.1** – patrz [7](#7-licencje-i-warunki-korzystania) | mapy w React |
| Recharts | 3.8.0 | MIT | wykresy |
| lucide-react | 1.77.0 | ISC | ikony |
| date-fns, react-day-picker | 4.4.0 / 10.0.2 | MIT | daty, kalendarz |
| sonner, next-themes | 2.0.8 / 0.4.6 | MIT | powiadomienia, motyw |
| @fontsource/lato | 5.2.5 | OFL-1.1 | font |
| TypeScript, ESLint (+ wtyczki) | 5.6.3 / 9.39.5 | Apache-2.0 / MIT | narzędzia |

### Usługi zewnętrzne

ULDK, NMT, KIEG, WMTS ORTO, BDOT10k i UUG (GUGiK) · IUNG-PIB SMSR (WMS) · ISRIC SoilGrids REST · Open-Meteo (Historical, Forecast) · NASA POWER · MET Norway Locationforecast · Earth Search STAC (Element 84) i Sentinel-2 COG na AWS Open Data · OpenStreetMap Nominatim (zapas wyszukiwarki). Żadna nie wymaga konta ani klucza; wszystkie są darmowe.

---

## 7. Licencje i warunki korzystania

**Dane:**

| Źródło | Warunki |
|---|---|
| GUGiK (ULDK, NMT, ortofotomapa, KIEG, BDOT10k, UUG) | dane PZGiK udostępniane bez opłat (art. 40a Prawa geodezyjnego i kartograficznego); atrybucja „© GUGiK” na mapach |
| IUNG-PIB SMSR (mapy, progi KBW) | dane publiczne IUNG-PIB; progi z aktu prawnego (Dz.U. 2019 poz. 739) |
| ISRIC SoilGrids 2.0 | CC BY 4.0 |
| Open-Meteo | CC BY 4.0 (dane), atrybucja w raporcie; darmowe API do użytku niekomercyjnego, plan płatny dla wdrożenia produkcyjnego |
| NASA POWER | dane publiczne NASA, bez ograniczeń, z podaniem źródła |
| MET Norway | CC BY 4.0 / NLOD; wymagany identyfikujący User-Agent (ustawiony) |
| Copernicus Sentinel-2 | wolny i otwarty dostęp (Copernicus Sentinel Data Legal Notice); w aplikacji atrybucja „Zawiera zmodyfikowane dane Copernicus Sentinel [rok]” |
| OpenStreetMap (Nominatim) | ODbL; maks. 1 zapytanie/s, bez autouzupełniania (przestrzegane) |

**Komponenty:** wszystkie biblioteki mają licencje permisywne (MIT, BSD, Apache-2.0, ISC; font OFL-1.1), z jednym wyjątkiem:

> ⚠️ **react-leaflet (Hippocratic License 2.1)** nie jest licencją permisywną w rozumieniu OSI – dodaje warunki etyczne (m.in. przestrzeganie praw człowieka). Nie blokuje użycia przez instytucję publiczną, ale może utrudnić przeniesienie praw na KOWR. Plan: zastąpić react-leaflet bezpośrednim użyciem Leaflet (BSD-2-Clause) – dotyczy 3 komponentów (`ParcelMap`, `FieldsMap`, `WaterCard`), ok. 2–3 h pracy.

**Kod rozwiązania:** stworzony w trakcie wydarzenia; prawa autorskie zgodnie z Regulaminem przechodzą na KOWR w przypadku wygranej.

---

## 8. Znane ograniczenia

- **Pogoda z modeli, nie ze stacji przy polu.** ERA5 ma siatkę ~9–25 km, NASA POWER ~50 km. Lokalna burza może nie być widoczna.
- **ET₀ FAO-56 zamiast zmodyfikowanego Penmana IUNG** – wartości KBW mogą się nieco różnić od komunikatów SMSR, zwłaszcza blisko progu.
- **Granice działki według obecnego stanu ewidencji**, także dla dat historycznych.
- **Uprawa deklarowana przez użytkownika** – porównanie z poprzednimi latami nie zna płodozmianu.
- **Gleba w skali regionalnej:** SoilGrids 250 m, mapa kategorii IUNG; na małej działce gleba może się różnić.
- **Satelita:** piksele 10–20 m (wąskie działki mają mało pikseli), tylko zdjęcia bez chmur; NDMI traktujemy jako potwierdzenie, nie główny sygnał.
- **Model spływu i bilans m³ są przesiewowe:** nie uwzględniają drenowania, bruzd, dróg polnych ani wsiąkania; objętości to rząd wielkości przy jawnych założeniach.
- **Kc i głębokość korzeni** to przybliżenia FAO-56 dla typowego kalendarza; tytoń nie ma wartości w FAO-56 (przyjęto analogię do warzyw).
- **Limity usług publicznych:** GUGiK i darmowe Open-Meteo limitują zapytania per IP (np. wspólna sieć na wydarzeniu). Aplikacja pokazuje baner, przełącza się na źródła zapasowe i obniża pewność – nie przerywa pracy.
- **Pierwsze zapytanie o satelitę** trwa 10–25 s (odczyt z AWS w USA), kolejne < 0,1 s.
- **Prognoza na przyszłą datę** opiera się na modelu numerycznym; drugi tydzień jest wyraźnie mniej pewny (obniżamy poziom pewności).
- **Prawo wodne:** aplikacja informuje o możliwych formalnościach (zgłoszenie/pozwolenie wodnoprawne), ale nie zastępuje decyzji Wód Polskich ani porady doradcy.

---

## 9. Weryfikacja wyników

1. **Zgodność z metodą referencyjną.** Ocena suszy używa tych samych okresów 60-dniowych, tych samych 14 grup upraw, kategorii gleb i wartości krytycznych co System Monitoringu Suszy Rolniczej IUNG-PIB. Wynik dla działki i daty można porównać z komunikatem SMSR dla gminy (susza.iung.pulawy.pl) – różnice wynikają z innej metody ET₀ i źródła pogody (opisane w ograniczeniach).
2. **Pełna przejrzystość raportu.** Każda przyczyna ma dowody liczbowe, każda rekomendacja – warunek, z którego wynika, i podstawę naukową; sekcja „Wiarygodność i źródła” podaje źródła z datą pobrania, zakresem i licencją, brakujące dane i poziom pewności.
3. **Niezależne potwierdzenie z satelity.** Ocena oparta na pogodzie i glebie jest zestawiana z wilgotnością roślin (NDMI) z Sentinel-2 na tle tych samych dat w poprzednich latach; interpretacja uwzględnia fazę uprawy.
4. **Dwa niezależne źródła pogody.** Open-Meteo (ERA5) i NASA POWER (MERRA-2) dają zbliżone KBW; przełączenie na zapas obniża poziom pewności.
5. **Powtarzalność.** Link do raportu (`/raport?dzialka=&uprawa=&data=`) odtwarza dokładnie te same obliczenia; dane historyczne są niezmienne.
6. **Testy automatyczne** (`pytest`): parsowanie usług, prognoza tylko z dni prognozy, bilans wody (m³ na hektar, opad roczny), obsługa błędów.
7. **Kontrola stabilności modelu spływu:** zmiana gęstości siatki (22 m → 12 m) zmienia udziały odpływu w granicach kilku punktów procentowych (np. 47% → 51%).
8. **Ręczna weryfikacja przez jury:** sekcja „Źródła i metoda” w aplikacji pokazuje stan usług na żywo i zasadę liczenia pewności; przykładowe raporty PDF są w [docs/raporty/](docs/raporty/).

---

## Skalowanie i koszty

- **Koszt danych: 0 zł.** Wszystkie źródła są darmowe. Dla wdrożenia produkcyjnego zalecany płatny plan Open-Meteo (zmienna `OPENMETEO_API_KEY`), bo darmowe API ma limit 10 000 zapytań dziennie per IP i jest przeznaczone do użytku niekomercyjnego.
- **Cache plikowy** sprawia, że działki w tej samej komórce pogody (0,05°) i powtórne raporty nie wysyłają nowych zapytań. Typowy raport z rozgrzanym cache: < 1 s.
- **Serwer bezstanowy** – można uruchomić wiele instancji za load balancerem ze wspólnym katalogiem cache (wolumen) albo zamienić cache plikowy na Redis/S3 bez zmian w logice.
- **Limity usług** obsługiwane są przez bezpiecznik (5 min przerwy po 429), serwowanie starszej kopii, źródła zapasowe i baner w interfejsie.
- **Czas odpowiedzi:** raport główny 1–8 s na zimno (wymóg ≤ 30 s spełniony), satelita i spływ doładowują się osobno.
- **Aktualizacja danych:** dane pogodowe i satelitarne odświeżają się same według ważności cache (pogoda 1 dzień, prognoza 3 h, nowe sceny Sentinel-2 12 h). Progi KBW IUNG aktualizuje się ręcznie po zmianie rozporządzenia, podmieniając jeden plik JSON. Zapas NASA POWER odświeża skrypt `prewarm_weather` (np. raz na dobę z crona).
- **Szacowane koszty infrastruktury:**

| Skala | Co jest potrzebne | Koszt orientacyjny |
|---|---|---|
| Prototyp / pilotaż (do kilkuset rolników) | 1 serwer VPS 2 vCPU, 4 GB RAM, 40 GB dysku na cache; darmowe API | ok. 50–100 zł / mies. |
| Region / województwo | 2–3 instancje za load balancerem, wspólny cache (wolumen lub Redis), płatny plan Open-Meteo | ok. 300–600 zł / mies. + Open-Meteo od kilkudziesięciu EUR / mies. (cennik: open-meteo.com/en/pricing) |
| Cała Polska | kilka instancji z autoskalowaniem, cache w Redis/S3, własna kopia ERA5 lub kafelki NMT dla najczęstszych regionów, monitoring | ok. 1,5–3 tys. zł / mies. |

  Jedyna płatna pozycja po stronie danych to plan Open-Meteo. Darmowa alternatywa to NASA POWER (już wbudowany zapas) albo własna kopia ERA5 z Copernicus Climate Data Store. Pozostałe źródła (GUGiK, IUNG, SoilGrids, Sentinel-2 na AWS Open Data, MET Norway) są bezpłatne.
- **Prywatność:** brak kont i danych osobowych; serwer nie przechowuje raportów ani historii zapytań użytkownika.

---

## Bezpieczeństwo i prywatność

- **Brak danych osobowych.** Aplikacja nie ma kont ani logowania. Numer działki ewidencyjnej nie identyfikuje właściciela, a „Moje pola” zapisują się tylko w przeglądarce (localStorage).
- **Walidacja wejścia.** Każdy parametr API ma ograniczoną długość (np. identyfikator działki 3–100 znaków), typ obrazu satelitarnego jest z listy dozwolonej, a identyfikator sceny Sentinel-2 jest sprawdzany wyrażeniem regularnym przed użyciem w ścieżce.
- **CORS** zezwala tylko na adres frontendu z konfiguracji (domyślnie `http://localhost:5173`).
- **Brak sekretów w repozytorium.** Opcjonalny klucz Open-Meteo czyta się z pliku `.env`, który jest w `.gitignore`. W repozytorium jest tylko `backend/.env.example`.
- **Odporność na usługi zewnętrzne.** Każde zapytanie ma timeout, a odpowiedzi są parsowane defensywnie. Awaria jednego źródła daje „brak danych” i niższą pewność, a nie błąd serwera.
- **Uprzejme korzystanie z usług publicznych.** Aplikacja przedstawia się w nagłówku User-Agent (MET Norway, Nominatim), przestrzega limitu 1 zapytania na sekundę w Nominatim i wstrzymuje zapytania do Open-Meteo po odpowiedzi 429.
- **Wdrożenie produkcyjne** powinno dodać HTTPS (reverse proxy), limit zapytań per IP na `/api/analysis` i aktualizację zależności (np. `pip-audit`, `npm audit`).

---

## API

| Endpoint | Co robi |
|---|---|
| `GET /api/health` | stan serwera |
| `GET /api/health/sources?fresh=` | dostępność GUGiK i źródeł prognozy (wynik pamiętany 60 s) |
| `GET /api/parcels/by-id?id=`, `GET /api/parcels/at?lat=&lon=` | działka z ULDK; `landuse=false` pomija wolniejsze sprawdzenie użytkowania |
| `GET /api/parcels/landuse?id=` | użytkowanie terenu działki (IUNG) |
| `GET /api/analysis/crops` | lista 14 upraw |
| `GET /api/analysis?parcel_id=&crop=&date=` | pełny raport: ocena, historia, przyczyny, rekomendacje, nawadnianie, bilans wody (`water`); `date` od 10 lat wstecz do 16 dni naprzód (`mode` = wsteczna / biezaca / prognoza) |
| `GET /api/analysis/runoff?parcel_id=` | model spływu D8 na NMT: strzałki, drogi spływu, odpływ, zagłębienia, napływ z sąsiednich gruntów, miejsce na oczko (~2,5 s na zimno) |
| `GET /api/analysis/satellite?parcel_id=&crop=&date=` | Sentinel-2 NDVI/NDMI działki na tle tej samej pory roku w poprzednich latach (10–25 s na zimno) |
| `GET /api/analysis/satellite/season?parcel_id=&date=` | bezchmurne klatki działki z całego sezonu (marzec–październik) z NDVI/NDMI (~25 s na zimno) |
| `GET /api/analysis/satellite/image?scene=&parcel_id=&kind=rgb\|ndmi` | PNG zdjęcia wokół działki z obrysem |
| `GET /api/geocode?q=` | wyszukiwanie miejscowości (GUGiK UUG, zapasowo Nominatim) |

Interaktywna dokumentacja: http://localhost:8000/docs.

---

## Struktura repozytorium

```
backend/
  app/main.py              FastAPI, /api/health
  app/routers/             analysis.py, parcels.py, geocode.py
  app/services/            źródła danych, metody (kbw, advisor, runoff, water_budget, sentinel), cache, status
  app/data/                kbw_thresholds.json (progi IUNG)
  scripts/prewarm_weather.py
  tests/
frontend/
  src/pages/               AnalysisPage, ReportPage, FieldsPage, MeasuresPage, SourcesPage
  src/components/analysis/ raport: ocena, przyczyny, woda, satelita, sezon, źródła
  src/components/map/      mapa wyboru działki
  src/lib/                 Moje pola (localStorage), formatowanie, geometria
docs/                      metodyka, prezentacja, film, zgłoszenie, zrzuty ekranu, raporty PDF, brand
docker-compose.yml
```
