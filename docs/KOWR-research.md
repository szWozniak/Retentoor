# KOWR – „Zatrzymaj wodę, chroń plony” – research

Stan na 2026-11-21 (dzień 1 hackathonu). Źródła: `KOWR - Pełna treść zadania konkursowego.pdf`, `KOWR - Podstawy naukowe.pdf` (Załącznik 1), `KOWR - Regulamin zadania konkursowego.pdf`.

## 0. Najważniejsze wnioski z Załącznika naukowego i Regulaminu

**Załącznik naukowy wprost wskazuje dwa fundamenty: FAO-56 (Allen i in.) oraz IUNG SMSR (Doroszewski i in. 2012).** To potwierdza wybór metodyki z sekcji 5: KBW + progi IUNG + ET0 FAO-56.

**Wymagana sekwencja analizy (struktura raportu musi ją odwzorować 1:1):**
> **ocena sytuacji wodnej → identyfikacja przyczyn → rekomendacje retencyjne → działania agrotechniczne → ewentualne nawadnianie**

- Załącznik wymaga rozróżnienia **bieżącej suszy** (w tym roku, na dzień analizy) od **podwyższonego prawdopodobieństwa suszy** wynikającego z lokalnego klimatu i gleby (analiza wieloletnia). W raporcie to powinny być dwie osobne sekcje.
- **Przyczyny mają być wskazane jawnie.** Załącznik wymienia 4 typy. Każdy przekładamy na wskaźnik z danych:

| Przyczyna (wg Załącznika) | Jak ją wykryć | Dane |
|---|---|---|
| 1. Deficyt opadów + wysoka temperatura | KBW poniżej progu, długość okresów bezopadowych, dni upalne, anomalia opadu i temperatury vs 10 lat, SPEI | Open-Meteo ERA5 |
| 2. Niska zdolność gleby do magazynowania wody (lekka, piaszczysta, mało materii organicznej) | kategoria gleby I–II, udział piasku, niski SOC; dostępna woda glebowa (AWC) z tekstury | IUNG WMS, SoilGrids |
| 3. Nadmierny odpływ powierzchniowy (teren nachylony, brak mokradeł, oczek, zadrzewień) | spadki z NMT; brak wód, mokradeł i zadrzewień w otoczeniu działki | GUGiK NMT, IUNG landuse / OSM / BDOT |
| 4. Wrażliwość uprawy | próg KBW uprawy, krytyczne fazy (np. kwitnienie), Kc z FAO-56 | tabela IUNG, FAO-56 |

- **Priorytet retencji przed nawadnianiem** („retain water where it falls”, europejskie NWRM). Kolejność rekomendacji w raporcie: najpierw retencja krajobrazowa (małe zbiorniki, oczka, mokradła, strefy buforowe, zadrzewienia śródpolne), potem retencja glebowa (międzyplony, resztki pożniwne, ograniczenie intensywnej uprawy, materia organiczna – „4 per mille”, Minasny 2017), a nawadnianie na końcu.
- Wskaźniki satelitarne **nie mogą być interpretowane samodzielnie**, tylko razem z danymi meteo, glebowymi i hydrologicznymi. Satelita to potwierdzenie, a nie główny sygnał.
- Bibliografia, którą warto cytować w raporcie i slajdach: FAO-56, Doroszewski 2012 (SMSR), EC NWRM 2014/2015, Minasny 2017, Żyłowska & Kozyra 2025 (IUNG, przegląd wskaźników suszy). Materiały polecane przez ekspertów: [POLSA – Dane satelitarne dla administracji](https://polsa.gov.pl/aktywnosci/obserwacja-ziemi/dane-satelitarne/) (rozdz. 6.3.3, 6.3.4) i [CDR e-poradnik „Melioracje, retencja…” 2025](https://woda.cdr.gov.pl/images/publikacje/Publikacje/Melioracje_retencja_wodna_e-poradnik_2025.pdf).

**Regulamin – rzeczy praktyczne:**
- **Organizator może wymagać wstępnej wersji rozwiązania już pierwszego dnia** (termin na Platformie konkursowej). Trzeba to sprawdzić.
- **Finał to tylko ok. 2–3 min prezentacji i do 2 min pytań.** Demo musi być błyskawiczne: działka z ID → raport w kilka sekund (cache rozgrzany wcześniej dla działek z demo).
- Zwycięzca przenosi prawa autorskie na KOWR, więc **licencje komponentów muszą na to pozwalać**. Unikamy copyleft (GPL/AGPL), wybieramy MIT/BSD/Apache. Licencje danych (CC-BY, ODbL) wypisujemy w README.
- Rozwiązanie musi powstać w trakcie wydarzenia. Gotowe biblioteki są OK, jeśli zostaną wskazane w dokumentacji.
- Nazwa zespołu **bez imion i nazwisk**.
- Nagroda: 25 000 zł netto (jedna, za I miejsce). Próg: min. 50% punktów i spełnienie wymagań formalnych.

---

## 1. O co chodzi (w 3 zdaniach)

Rolnik podaje **numer działki ewidencyjnej** (albo klika na mapie) i **wybiera uprawę**. Aplikacja na żywo pobiera dane (meteo, satelita, gleba, hydrologia, teren) z **ostatnich 10 lat**, ocenia sytuację wodną działki i jej historyczną podatność na suszę, a potem generuje **raport z rekomendacjami** (retencja, agrotechnika, opcjonalnie nawadnianie) z uzasadnieniem, źródłami, datami i ograniczeniami. Raport da się zapisać jako PDF albo wydrukować.

## 2. Twarde wymagania (checklista)

| # | Wymaganie | Uwagi |
|---|---|---|
| 1 | Web app w przeglądarce (Windows: Chrome/Firefox/Edge/Safari/Opera), bez instalacji | mobile = bonus |
| 2 | Wejście: **ID działki** albo **punkt na mapie** | ULDK obsługuje oba warianty |
| 3 | Wybór **uprawy** | 14 grup upraw IUNG pasuje idealnie |
| 4 | **Data analizy** podawana przez jury (dziś albo dowolna data z ostatnich 10 lat) | ⚠️ cała analiza musi liczyć się „na dzień X”, bez danych z przyszłości |
| 5 | Wynik **liczony z pobranych danych** (bieżących i archiwalnych z 10 lat). Gotowe teksty nie wystarczą | szablony zdań są OK, o ile ich treść wynika z liczb |
| 6 | Kolejność: **ocena, potem rekomendacje**. Bez oceny nie ma rekomendacji | rekomendacje muszą wskazywać, które dane je uzasadniają |
| 7 | Raport: stan niedoboru wody i przyczyny, rekomendacje z uzasadnieniem, **data i źródła danych**, **ograniczenia i niepewność**, **jawny brak danych** („bez pozornej precyzji”) | |
| 8 | Zapis raportu: w systemie albo PDF albo druk | najprościej: CSS `@media print` + przycisk „Pobierz PDF” |
| 9 | Dane z 5 kategorii: meteo, satelita, gleba, hydrologia, przestrzenne (działka, użytkowanie, rzeźba terenu) | wszystkie muszą być **darmowe i legalne** |
| 10 | Działa dla **dowolnej działki w Polsce** | |
| 11 | Preferowany czas generowania **≤ 30 s** | cache i równoległe zapytania |
| 12 | Brak danych osobowych | tylko numer działki, bez kont użytkowników |

**Do oddania:** nazwa zespołu i tytuł, opis rozwiązania, **prywatne repo** (dostęp dla jury według instrukcji na platformie), README z 9 obowiązkowymi punktami (sekcja 4.2 PDF), **PDF do 10 slajdów**, **film do 3 min**, **wygenerowane raporty**, działający prototyp (link albo instrukcja uruchomienia).

README musi zawierać m.in.: które dane pobieramy na żywo, a które wcześniej (z datami), listę bibliotek, usług i AI z licencjami, znane ograniczenia, sposób weryfikacji wyników oraz opis skalowania (cache, limity API, koszty).

## 3. Jak oceniają

| Kryterium | Waga | Co to dla nas znaczy |
|---|---|---|
| Wartość praktyczna dla rolnika | 25% | konkretne zalecenia z terminami („w maju–lipcu…”), nie ogólniki |
| **Dane i wiarygodność rekomendacji** | 25% | metody zgodne z nauką (**IUNG KBW**), wiele źródeł, uzasadnienie, jawna niepewność |
| Innowacyjność i potencjał | 20% | np. analiza rzeźby terenu (gdzie spływa woda), anomalie satelitarne na tle 10 lat |
| Prostota obsługi | 15% | 3 kroki: działka → uprawa → raport, język rolnika, nie GIS |
| Prototyp i jakość techniczna | 15% | stabilność, ≤30 s, README, licencje |

**Etap 1:** jurorzy sami odpalają aplikację dla tych samych działek z całej Polski (ID + data) i porównują wyniki z **danymi referencyjnymi**. Prawie na pewno chodzi o IUNG SMSR (KBW, kategorie gleb) albo EDO.
**Etap 2 (finał, 3–5 zespołów):** demo na żywo dla 1–3 działek podanych przez jury. Według Regulaminu prezentacja trwa ok. 2–3 min, plus do 2 min pytań.

## 4. Źródła danych – co sprawdziłem na żywo

| Kategoria | Źródło | Status | Czas | Do czego |
|---|---|---|---|---|
| Przestrzenne / działka | **ULDK GUGiK** `uldk.gugik.gov.pl` – `GetParcelByIdOrNr`, `GetParcelByXY` | ✅ działa | ~0,3 s (pierwsze zapytanie bywało wolne) | geometria działki (WKT, EPSG:4326), TERYT, gmina, obręb |
| Gleba | **IUNG mapa kategorii glebowych** – WMS `sgeo.iung.pl/geoserver/Susza/wms`, warstwa `Susza:katgl_landuse2024`, GetFeatureInfo JSON | ✅ działa | <1 s | **kategoria gleby I–IV** (klucz do progów KBW) + użytkowanie terenu (las, woda, zabudowa…) |
| Gleba | **ISRIC SoilGrids** REST `rest.isric.org/soilgrids/v2.0/properties/query` | ✅ 200 | ~1 s | ił, piasek, węgiel organiczny (SOC), gęstość → retencja / pojemność wodna (CC-BY 4.0) |
| Meteo (10 lat) | **Open-Meteo Archive (ERA5)** `archive-api.open-meteo.com` – opad, **ET0 FAO-56**, temperatura, **wilgotność gleby 0–7 i 7–28 cm** | ✅ 200 | daily 10 lat ≈ 5 s; hourly z wilgotnością ≈ 10 s | **KBW = P − ET0**, SPI/SPEI, percentyle wilgotności gleby (CC-BY 4.0) |
| Meteo (bieżące, prognoza) | Open-Meteo Forecast | ✅ | <1 s | wskazówki nawadniania na najbliższe dni |
| Meteo (stacje) | IMGW-PIB `danepubliczne.imgw.pl` | nie testowałem | | opcjonalnie: walidacja ERA5 z najbliższą stacją |
| Satelita | **Sentinel-2 L2A – Earth Search STAC** `earth-search.aws.element84.com/v1` (bez konta) | ✅ | wyszukiwanie ~0,8 s; **732 sceny <20% chmur** dla punktu pod Bydgoszczą w 10 lat | NDVI / **NDMI** dla działki, anomalia względem tej samej pory roku z 10 lat; maska chmur z pasma SCL |
| Teren | **GUGiK NMT** `services.gugik.gov.pl/nmt/?request=GetHByPointList` (EPSG:2180, NMT 1 m) | ✅ | ~1,4 s / zapytanie | siatka wysokości po działce → spadki, najniższe miejsca (**gdzie zatrzymać wodę**) |
| Teren (zapas) | Open-Meteo Elevation (DEM 90 m) | ✅ | <1 s | |
| Hydrologia | **OSM Overpass** (rzeki, rowy, kanały, zbiorniki w promieniu X) | ⚠️ **przeciążony** (502/406, wszyscy z niego korzystają) | | odległość do cieków i rowów, potencjał retencji krajobrazowej. Potrzebny mirror albo fallback |
| Hydrologia | Wody Polskie WFS `wody.isok.gov.pl/wss/INSPIRE/...` (MPHP, cieki) | nie testowałem | | oficjalna sieć hydrograficzna (lepiej brzmi w raporcie niż OSM) |
| Tło suszowe | **EDO Copernicus WMS** – warstwy `smian` (anomalia wilgotności gleby), `cdiad` (Combined Drought Indicator), `fpanv` (anomalia fAPAR), SPI | ⚠️ GetCapabilities działa, GetFeatureInfo jeszcze nie (zły format zapytania?) | | porównanie z europejskim wskaźnikiem suszy |
| Referencja | **IUNG SMSR – progi KBW** `susza.iung.pulawy.pl/progi/` | ✅ **pobrane** → `backend/app/data/kbw_thresholds.json` | | 14 upraw × 4 kategorie gleb × 14 okresów sześciodekadowych |

Testowa działka (rolnicza ani nie jest, ale można na niej sprawdzić API): `046101_1.0098.225/18` (Bydgoszcz, kat. IUNG = 13 „tereny zabudowane”). **Potrzebujemy kilku prawdziwych działek rolnych do testów** z różnych województw.

## 5. Metodyka – na czym oprzeć „naukowość”

**Rdzeń: metoda IUNG (SMSR).** To oficjalna polska metoda wykrywania suszy rolniczej (rozporządzenie MRiRW z 11.04.2019, Dz.U. 2019 poz. 739), więc najpewniej z niej pochodzą dane referencyjne jury.
- **KBW** (klimatyczny bilans wodny) = suma opadu − suma ewapotranspiracji potencjalnej w **okresach sześciodekadowych** (60 dni), od 21.III do 30.IX, przesuwanych co dekadę (14 okresów).
- **Susza** występuje, gdy KBW < **wartości krytycznej** dla danej uprawy i kategorii gleby. Próg odpowiada **spadkowi plonu o ≥20%**.
- Kategorie gleby I (bardzo lekkie, najbardziej podatne) … IV (ciężkie). Pobieramy je z WMS IUNG dla działki.
- Tabela progów jest już w repo. Przykład: zboża ozime, kat. I, okres 21.IV–20.VI: **−145 mm**.
- IUNG liczy ETP zmodyfikowanym Penmanem. My użyjemy **ET0 FAO-56 Penman-Monteith z Open-Meteo**. Różnicę trzeba opisać w ograniczeniach.

**Ocena historyczna (10 lat):** dla każdego roku liczymy KBW we wszystkich okresach i sprawdzamy, w ilu latach i okresach przekroczono próg. Wychodzi z tego np. „susza w 6 z 10 lat, najczęściej V–VII”. To jest „historyczna podatność działki”, której wymaga zadanie.

**Ocena bieżąca (na dzień X):**
1. KBW za ostatni okres 60-dniowy na tle progu i rozkładu z 10 lat (percentyl).
2. Wilgotność gleby ERA5 (0–7 i 7–28 cm) jako percentyl względem tego samego dnia roku w latach 2016–2025.
3. Satelitarnie: NDMI i NDVI działki z ostatnich bezchmurnych scen względem średniej z 10 lat dla tej pory roku. Interpretacja musi **zależeć od uprawy** (zadanie tego wymaga): np. niski NDVI po żniwach zbóż to rzecz normalna, a nie susza. Potrzebny prosty kalendarz fenologiczny dla 14 upraw.
4. Opcjonalnie SPI/SPEI (standaryzowany wskaźnik opadu / bilansu) jako drugi, uznany w literaturze wskaźnik.

**Rekomendacje = reguły zależne od wyników oceny.** Każda reguła ma warunek z danych i przypisane uzasadnienie. Przykłady:
- kat. gleby I–II + niski SOC (SoilGrids) → międzyplony, mulcz, pozostawianie resztek pożniwnych, uproszczona uprawa (mniej strat wilgoci);
- duże spadki na działce (NMT) → zatrzymywanie spływu: pasy buforowe, uprawa w poprzek stoku, oczka i niecki w najniższym punkcie (wskazane na mapie);
- rów lub ciek w promieniu < X m (hydrologia) → zastawki na rowach melioracyjnych, spowolnienie odpływu (retencja krajobrazowa);
- najczęstszy okres suszy V–VII → monitoring i nawadnianie w tych miesiącach;
- nawadnianie (opcjonalne): deficyt = Σ(ET0·Kc − P) dla uprawy z **Kc z FAO-56** + prognoza opadu z Open-Meteo na 7 dni → „nawadniać / wstrzymać się, około N mm”.

**Niepewność (wymagana):** rozdzielczość ERA5 około 9–25 km (to nie jest pomiar na działce), zachmurzenie (ile scen naprawdę było dostępnych), SoilGrids 250 m, ET0 ≠ metoda IUNG, uprawa deklarowana przez użytkownika. Zamiast udawać precyzję podajemy **poziom pewności** (wysoki/średni/niski) zależny od tego, ile danych było dostępnych.

## 6. Proponowana architektura (na naszym baseline)

```
React (Vite + shadcn)                          FastAPI
┌───────────────────────────┐   POST /api/analysis   ┌──────────────────────────────────────┐
│ 1. ID działki / klik mapa │ ─────────────────────▶ │ parcel: ULDK → geometria, TERYT      │
│    (Leaflet + OSM/Geoport)│                        │ równolegle (asyncio + httpx):        │
│ 2. uprawa (14 IUNG)       │                        │  ├ IUNG WMS → kategoria gleby        │
│ 3. data analizy (domyślnie│                        │  ├ SoilGrids → tekstura, SOC         │
│    dziś)                  │ ◀───────────────────── │  ├ Open-Meteo archive 10 lat → KBW   │
│ 4. RAPORT: ocena → reko-  │    JSON raportu        │  ├ Sentinel-2 STAC + COG → NDVI/NDMI │
│    mendacje, wykresy,     │                        │  ├ GUGiK NMT → spadki                │
│    mapa, źródła, niepew-  │                        │  └ hydrologia → cieki/rowy           │
│    ność; Drukuj / PDF     │                        │ engine: ocena → reguły → raport      │
└───────────────────────────┘                        │ cache (SQLite) wyników i odpowiedzi  │
                                                     └──────────────────────────────────────┘
```
- Mamy już: KPI tiles, wykresy (KBW na tle progu, NDVI na tle normy), skeletony na czas ~10–30 s ładowania, toasty.
- Dochodzi: **Leaflet** (mapa działki, punkty retencji), `rasterio` do odczytu wycinków COG Sentinel-2 (tylko okno działki, nie cała scena), `shapely` i `pyproj` (WKT, EPSG:2180).
- PDF: na start `window.print()` + arkusz CSS do druku. Jeśli zostanie czas, generowanie po stronie serwera.
- Cache wyników w SQLite (klucz: działka + uprawa + data). Odpowiada też na wymóg opisu skalowania.

## 7. Ryzyka

1. **Sieć na miejscu i przeciążone API** (Overpass już leży, ULDK bywa wolne): cache, timeouty, fallbacki (DEM z Open-Meteo, mirrory Overpass), a w raporcie jawne „brak danych z X”.
2. **Czas ≤30 s**: Sentinel-2 to najcięższa część (dziesiątki scen). Ograniczyć do jednej sceny na miesiąc w sezonie i czytać równolegle tylko wycinek działki.
3. **Daty historyczne**: każde źródło musi przyjmować „datę analizy” (ERA5 i Sentinel tak; IUNG kategoria gleby jest statyczna). Pilnować, żeby nie używać danych po dacie analizy.
4. **Zgodność z referencją jury**: KBW liczony z ERA5 będzie się różnił od KBW IUNG (stacje + interpolacja). Warto zapytać mentora (dr inż. Bolewski), jaka tolerancja jest akceptowalna.
5. **Licencje**: OSM = ODbL, Open-Meteo/SoilGrids = CC-BY 4.0, Sentinel = Copernicus (otwarte), GUGiK = dane bez opłat (PZGiK). Wszystko trzeba wypisać w README.

## 7a. Propozycja na później: predykcja pogody / szeregów czasowych

**Propozycja od kolegi:** modele foundation do szeregów czasowych, **Timestral** i **Toto 2.0**, gdybyśmy uznali, że potrzebujemy własnej predykcji (pogoda, KBW, wilgotność gleby).

Status: **niezweryfikowane**. Nie sprawdzałem jeszcze dostępności, licencji, wymagań sprzętowych ani tego, czy nazwy są dokładne.

Zanim się zdecydujemy, trzeba sprawdzić:
- Czy w ogóle potrzebujemy własnej predykcji. Open-Meteo daje gotową prognozę na ok. 16 dni (i prognozy sezonowe) za darmo. Własny model ma sens tylko dla prognozy dłuższej niż te 16 dni (np. ryzyko suszy na resztę sezonu) albo dla predykcji na poziomie działki.
- Licencję. Zwycięzca przenosi prawa na KOWR, więc potrzebujemy licencji permisywnej (Apache/MIT), bez ograniczeń niekomercyjnych.
- Sprzęt. Mamy laptop z GPU 4 GB, a prognoza ma mieścić się w limicie ~30 s na działkę, więc model musi działać rozsądnie na CPU albo trzeba liczyć wcześniej i cache'ować.
- Wiarygodność. Prognozy trzeba pokazać z niepewnością (przedziały), zgodnie z wymogiem „bez pozornej precyzji”, i opisać w README jako użycie AI (wymóg 4.2 pkt 6).

## 8. Pytania do mentorów (Discord)

- Czy jest termin na **wstępną wersję rozwiązania** w pierwszym dniu?
- Z jakich danych referencyjnych korzysta jury: SMSR IUNG, EDO, coś innego? Jaka tolerancja?
- Czy KBW z ET0 FAO-56 (zamiast Penmana w wersji IUNG) jest akceptowalny?
- Jak udostępnić repo jury (nazwy kont)?
- Czy dla działki ze zmiennymi uprawami w historii (płodozmian) wystarczy założenie „uprawa jak w tym roku”?

## 9. Plan na resztę hackathonu (propozycja)

1. **Teraz (2–3 h):** pipeline danych w backendzie: działka (ULDK), kategoria gleby (IUNG), Open-Meteo 10 lat → KBW i ocena względem progów. Zwraca JSON. Frontend: formularz z mapą i surowy wynik.
2. **Kolejne 3–4 h:** Sentinel-2 (NDMI/NDVI, anomalia), NMT (spadki), hydrologia, SoilGrids. Silnik reguł rekomendacji z uzasadnieniami.
3. **Kolejne 3–4 h:** widok raportu (wykresy, mapa, źródła, niepewność), druk/PDF, cache, obsługa braków danych.
4. **Ostatnie ~6 h:** testy na kilkunastu działkach z całej Polski, README (9 punktów + skalowanie + licencje), slajdy PDF, film 3 min, przykładowe raporty.

## Źródła

- Treść zadania KOWR (PDF od organizatora)
- [IUNG SMSR – wartości progowe KBW](https://susza.iung.pulawy.pl/progi/), [mapa kategorii glebowych](https://susza.iung.pulawy.pl/mapa-kategorii/)
- [Rozporządzenie MRiRW, Dz.U. 2019 poz. 739](https://www.prawo.pl/akty/dz-u-2019-739,18844910.html)
- [Doroszewski i in., „Susza rolnicza w Polsce” (IUNG)](https://iung.pl/images/wyd/Susza%20rolnicza%20w%20Polsce.pdf)
- [ULDK GUGiK](https://uldk.gugik.gov.pl/?lang=en)
- [Wody Polskie / INSPIRE WFS](https://inspire-geoportal.ec.europa.eu/srv/api/records/90ffe93a-298a-11eb-adc1-0242ac120002)
