# Metodyka Retentoor

Jak aplikacja liczy ocenę, przyczyny i rekomendacje. Każda liczba w raporcie wynika z danych pobranych dla wskazanej działki i daty. Nie ma gotowych tekstów: zdania są szablonami wypełnianymi wynikami obliczeń, a każda rekomendacja pojawia się tylko wtedy, gdy spełniony jest warunek na zmierzonych danych.

Kolejność raportu odwzorowuje sekwencję z Załącznika naukowego KOWR:
**ocena sytuacji wodnej → przyczyny → retencja krajobrazowa → retencja glebowa i agrotechnika → nawadnianie.**

---

## 1. Działka i dane wejściowe

| Wejście | Skąd | Uwagi |
|---|---|---|
| Identyfikator działki (TERYT) albo kliknięcie na mapie | ULDK GUGiK (`GetParcelById`, `GetParcelByXY`) | geometria, powierzchnia, gmina, powiat, województwo |
| Uprawa | 14 grup upraw IUNG SMSR | ta sama lista co w tabeli progów suszy |
| Data analizy | domyślnie dziś; od 1 stycznia sprzed 10 lat do 16 dni naprzód | tryby: **wsteczna** (przeszłość), **bieżąca** (dziś ±2 dni), **prognoza** (przyszłość) |

Analiza na dzień X używa wyłącznie danych do dnia X. Dni po dzisiejszej dacie pochodzą z prognozy pogody i są w raporcie oznaczone (linia przerywana na wykresie, adnotacja w ograniczeniach).

## 2. Ocena sytuacji wodnej – metoda IUNG SMSR

**Klimatyczny bilans wodny (KBW)** = suma opadu − suma ewapotranspiracji potencjalnej w okresie 60 dni (sześć dekad).

- Okresy jak w Systemie Monitoringu Suszy Rolniczej IUNG-PIB: 14 okresów od 21.III–20.V do 1.VIII–30.IX, przesuwanych co dekadę.
- **Susza** = KBW poniżej wartości krytycznej dla danej uprawy i kategorii gleby. Progi pochodzą z tabeli IUNG (Rozporządzenie MRiRW, Dz.U. 2019 poz. 739) i odpowiadają spadkowi plonu o co najmniej 20%. Tabela jest w `backend/app/data/kbw_thresholds.json`.
- **Kategoria gleby I–IV** pochodzi z mapy IUNG (`katgl_landuse2024`), próbkowanej w kilku punktach działki (kategoria dominująca + udziały).
- **ET₀** liczymy metodą FAO-56 Penman-Monteith (Open-Meteo ERA5; przy NASA POWER liczymy sami z temperatury, wilgotności, wiatru i promieniowania). IUNG stosuje zmodyfikowaną metodę Penmana – różnica jest opisana w ograniczeniach raportu.

Raport rozdziela dwie rzeczy, czego wymaga Załącznik naukowy:

1. **Susza bieżąca** – ostatni zakończony okres IUNG przed datą analizy na tle progu oraz bieżące okno 60 dni na tle tych samych dat z 10 lat (percentyl i mediana).
2. **Podatność wieloletnia** – dla każdego z 10 poprzednich sezonów liczymy wszystkie 14 okresów: „susza w N z 10 lat, najczęściej w okresie X”. Ta sama analiza dla wszystkich 14 upraw daje **porównanie upraw** na tej działce.

## 3. Przyczyny (4 typy z Załącznika)

| Przyczyna | Wskaźnik | Dane |
|---|---|---|
| Deficyt opadów i wysoka temperatura | KBW vs próg, opad i ET₀ okna vs wielolecie, najdłuższy okres bez opadu, dni upalne | Open-Meteo / NASA POWER |
| Niska zdolność gleby do magazynowania wody | kategoria IUNG I–II, udział piasku, węgiel organiczny, woda dostępna (AWC z SoilGrids) | IUNG, ISRIC SoilGrids |
| Nadmierny odpływ | spadki i różnica wysokości (NMT), udział wód, lasów i gleb organicznych w promieniu ~1 km, rowy melioracyjne | GUGiK NMT, IUNG, BDOT10k |
| Wrażliwość uprawy | historia suszy dla tej uprawy na tej glebie, krytyczny okres, uprawy mniej narażone | progi IUNG, 10 lat pogody |

Każda przyczyna ma status (tak / częściowo / nie / brak danych) i listę dowodów z liczbami.

## 4. Rekomendacje (reguły)

Reguły są w `backend/app/services/advisor.py`. Kolejność: krajobraz → gleba → agrotechnika → nawadnianie. Każda rekomendacja ma: warunek, liczby, które ją uzasadniają, priorytet, podstawę (NWRM, CDR 2025, FAO-56, IUNG) i – jeśli trzeba – informację o formalnościach (Prawo wodne).

| Rekomendacja | Warunek |
|---|---|
| Zastawka na rowie | rów BDOT10k ≤ 50 m od działki |
| Rów w okolicy – wspólna zastawka | rów 50–300 m |
| Niecka / oczko w najniższym miejscu (wskazane na mapie) | różnica wysokości ≥ 1 m i spadek ≥ 1% |
| Pas buforowy na dolnej krawędzi | spadek ≥ 3% |
| Elementy krajobrazu (zadrzewienia, miedze) | wody + lasy + gleby organiczne < 10% w promieniu ~1 km |
| Materia organiczna | węgiel organiczny < 2% albo gleba lekka |
| Międzyplony i okrywa gleby | zawsze; priorytet wysoki przy suszy ≥ 3/10 lat lub glebie lekkiej |
| Uprawa uproszczona | susza ≥ 2/10 lat, bieżący niedobór lub gleba lekka |
| Termin siewu pod krytyczny okres | jest okres z powtarzającą się suszą |
| Uprawy mniej narażone | susza ≥ 3/10 lat i inne grupy upraw wyraźnie rzadziej |
| Nawadnianie z dawką | bilans strefy korzeniowej (niżej) |

## 5. Nawadnianie – bilans wody w strefie korzeni (FAO-56, rozdz. 8, uproszczony)

- Start 1 marca przy polowej pojemności wodnej; codziennie: `Dr = Dr − Peff + Kc·ET₀`, ograniczone do `[0, TAW]`.
- `Peff = 0,8 · P` dla dni z opadem > 2 mm. `TAW = AWC · Zr`, `RAW = p · TAW`.
- Kc, głębokość korzeni Zr i frakcja p z tabel FAO-56 (Table 12 i 22) przypisane do polskiego kalendarza upraw (`CROP_PARAMS`).
- Decyzja: **zasadne** (Dr > RAW i prognoza na 7 dni nie pokrywa niedoboru) z dawką w mm, **wstrzymaj się** (deszcz w prognozie), **niezasadne**, **poza sezonem**.
- Prognoza: Open-Meteo (16 dni), zapasowo MET Norway (~10 dni, ET₀ liczone FAO-56).

## 6. Satelita – Sentinel-2 L2A (potwierdzenie, nie główny sygnał)

- Sceny z Earth Search STAC (AWS Open Data), odczyt tylko okna działki z plików COG (rasterio).
- NDVI = (B8A − B04)/(B8A + B04), NDMI = (B8A − B11)/(B8A + B11), mediana pikseli działki.
- Maska chmur z klasyfikacji sceny SCL (klasy 4 i 5); zdjęcie bierzemy, gdy ≥ 80% działki jest bez chmur.
- Poprawka BOA offset (−0,1) tylko dla baseline ≥ 04.00, gdy Earth Search jej nie zastosował.
- Porównanie z tą samą porą roku (±20 dni) w poprzednich latach. Interpretacja zależy od uprawy: faza z kalendarza Kc; przy NDVI < 0,4 (goła gleba, ściernisko) wynik jest „niepewny”, a lata bez zieleni nie wchodzą do „normy”.
- **Sezon z satelity**: najmniej zachmurzona scena z każdego tygodnia od marca do października, krzywa NDVI/NDMI i animacja klatek.

## 7. Spływ wody – model D8 na NMT

- Siatka do 2400 punktów (3–25 m) nad działką z marginesem, wysokości z usługi NMT GUGiK (paczki po 800 punktów).
- Wygładzenie 3×3 (szum NMT ~0,1–0,2 m), kierunki spływu D8 (O'Callaghan i Mark 1984), akumulacja przepływu od najwyższej komórki.
- Wynik: strzałki spadku, główne drogi spływu, miejsca, którędy woda opuszcza działkę (udział %), miejsca, gdzie się zbiera, powierzchnia gruntów spływających na działkę, najlepsze miejsce na oczko (komórka z największą zlewnią).
- To narzędzie przesiewowe: nie uwzględnia drenowania, bruzd, dróg polnych ani wsiąkania.

## 8. „Ile wody zatrzymasz” – bilans w m³

| Wielkość | Wzór i założenia |
|---|---|
| Rocznie spada na działkę | średni roczny opad z 10 pełnych lat × powierzchnia |
| Z ulewy ucieka | (1 − udział wody zatrzymanej w zagłębieniach) × powierzchnia × 30 mm × 0,2 (spływ powierzchniowy z pola) |
| Oczko / niecka | zlewnia miejsca z modelu D8 × 30 mm × 0,2; pojemność przy głębokości 1 m |
| Zastawka na rowie | długość rowu (bok działki) × szerokość (BDOT10k) × 0,4 m + podniesienie wód gruntowych o 0,3 m w pasie 50 m przy odsączalności 10% |
| Materia organiczna | +1 pkt proc. węgla organicznego → +1,16 pkt proc. objętości wody dostępnej w warstwie 0–30 cm (Minasny i McBratney 2018) |
| Przelicznik „dni” | objętość / (ET₀ lato × Kc max × powierzchnia) |

Wartości 30 mm, 0,2, 0,4 m, 0,3 m i 50 m to przyjęte założenia przesiewowe, a nie dane ze źródeł. Raport pokazuje je przy każdej liczbie („założenia”).

## 9. Poziom pewności

Start: 3 punkty (wysoki). Odejmujemy:

| Powód | Punkty |
|---|---|
| brak kategorii gleby IUNG (nie da się porównać z progiem) | −2 |
| gleba organiczna albo teren nierolniczy | −1 |
| niepełne dane pogodowe w oknie 60 dni | −1 |
| pogoda z zapasowego NASA POWER (~50 km zamiast 9–25 km) | −1 |
| data analizy > 7 dni naprzód | −1 |

3 = wysoki, 2 = średni, mniej = niski. Raport zawsze wypisuje brakujące dane i ograniczenia. Ta sama działka może raz dostać pewność wysoką, a raz średnią – np. gdy Open-Meteo chwilowo limituje zapytania i aplikacja przełącza się na NASA POWER.

## Bibliografia

- Allen R.G., Pereira L.S., Raes D., Smith M. (1998). *Crop evapotranspiration*. FAO Irrigation and Drainage Paper 56.
- Doroszewski A. i in. (2012). *Podstawy systemu monitoringu suszy rolniczej*. Woda-Środowisko-Obszary Wiejskie 12(2).
- Rozporządzenie MRiRW z 11.04.2019 (Dz.U. 2019 poz. 739) – wartości krytyczne KBW.
- European Commission (2014/2015). *Natural Water Retention Measures* (NWRM).
- Centrum Doradztwa Rolniczego (2025). *Melioracje, retencja i gospodarka wodna w rolnictwie* (e-poradnik).
- Minasny B. i in. (2017). Soil carbon 4 per mille. *Geoderma* 292.
- Minasny B., McBratney A.B. (2018). Limited effect of organic matter on soil available water capacity. *European Journal of Soil Science* 69.
- O'Callaghan J.F., Mark D.M. (1984). The extraction of drainage networks from digital elevation data. *Computer Vision, Graphics, and Image Processing* 28.
- Saxton K.E., Rawls W.J. (2006). Soil water characteristic estimates by texture and organic matter. *SSSA Journal* 70.
