# Skąd biorą się przyczyny i rekomendacje – audyt źródeł

Stan: 2026-11-21. Każda reguła z `backend/app/services/advisor.py` (oraz `kbw.py`, `ditches.py`) zestawiona ze swoją podstawą.

**Legenda**
- ✅ **KOWR** – wprost z dokumentów zadania: *Treść zadania* (TZ) lub *Podstawy naukowe* (PN), cytat poniżej
- 📚 **Literatura** – metoda / wartość z publikacji naukowej lub wytycznych (zweryfikowana w źródle pierwotnym, jeśli zaznaczono)
- 🧑‍🏫 **Mentorzy** – z konsultacji z mentorami KOWR
- ⚠️ **Próg własny** – liczba dobrana przez zespół (rozsądna, ale bez źródła) → do potwierdzenia z mentorem (dr inż. T. Bolewski) albo opisania w README jako założenie

Zasada ogólna (✅ PN): *„ocena sytuacji wodnej → identyfikacja przyczyn → rekomendacje retencyjne → działania agrotechniczne → ewentualne nawadnianie”* – raport i kolejność rekomendacji odwzorowują to 1:1. TZ 3.2: *„System nie powinien generować rekomendacji bez uprzedniego rozpoznania warunków dotyczących analizowanej działki”* – każda rekomendacja ma warunek na danych tej działki.

---

## 1. Ocena sytuacji wodnej

| Element | Podstawa | Status |
|---|---|---|
| KBW = opad − ewapotranspiracja w okresach 60-dniowych, 14 okresów 21.III–30.IX | PN: *„metodologii stosowanej przez IUNG-PIB w ramach Systemu Monitoringu Suszy Rolniczej”*; Doroszewski i in. 2012 | ✅ 📚 |
| Progi suszy dla 14 upraw × 4 kategorie gleb | Rozporządzenie MRiRW, Dz.U. 2019 poz. 739; tabela pobrana automatycznie z susza.iung.pulawy.pl/progi (`backend/app/data/kbw_thresholds.json`) | 📚 (dane źródłowe 1:1) |
| Kategoria gleby I–IV | Mapa IUNG-PIB `Susza:katgl_landuse2024` (ta sama, co w SMSR) | 📚 |
| ET₀ metodą FAO-56 Penman-Monteith | PN, bibliografia: Allen i in., FAO-56. Uwaga w raporcie: IUNG stosuje zmodyfikowanego Penmana | 📚 |
| Analiza bieżąca + 10 lat historii | TZ 3.2 pkt 1a: *„w oparciu o dane za ostatnie 10 lat”*; TZ 3.3 pkt 4 | ✅ |
| Rozróżnienie: susza teraz vs. częstość w wieloleciu | PN: *„Należy zatem rozróżniać bieżące występowanie suszy od podwyższonego prawdopodobieństwa jej wystąpienia”* | ✅ |
| Percentyl bilansu na tle 10 lat („bardzo sucho / typowo”) | Sposób prezentacji (analogiczny do wskaźników standaryzowanych typu SPI) | ⚠️ prezentacja, nie kryterium suszy |
| „Blisko progu suszy” gdy zapas < 30 mm | | ⚠️ |

## 2. Przyczyny (PN, sekcja *„Identyfikacja przyczyn ograniczonej dostępności wody”* – 4 typy)

| Przyczyna | Cytat z PN | Dane | Progi | Status |
|---|---|---|---|---|
| Niedobór opadów i wysoka temperatura | *„długotrwały deficyt opadów połączony ze wzrostem temperatury powietrza”* | Open-Meteo / NASA POWER | „tak”: opad < 60% mediany lub percentyl ≤ 20; „częściowo”: opad < 85%, +3 dni upalne (≥30°C), +5 dni najdłuższego okresu bez opadu, lub susza IUNG | ✅ przyczyna · ⚠️ progi |
| Mała zdolność gleby do magazynowania wody | *„Gleby ubogie w materię organiczną zatrzymują mniej wody”*; *„gleby lekkie, piaszczyste zazwyczaj zatrzymują mniej wody”* | IUNG kat., SoilGrids | kat. I–II; AWC < 110 mm/m; SOC < 1,2% (2 z 3 → „tak”) | ✅ przyczyna · 📚 AWC (Saxton & Rawls 2006 – współczynniki zweryfikowane z implementacją USDA WEPP `saxpar.for`) · ⚠️ progi 110 mm i 1,2% |
| Szybki odpływ / mało retencji krajobrazowej | *„nadmiernego odpływu powierzchniowego. Dotyczy to szczególnie terenów nachylonych lub obszarów pozbawionych elementów krajobrazu spowalniających obieg wody, takich jak mokradła, oczka wodne czy zadrzewienia śródpolne”* | NMT GUGiK, mapa IUNG (otoczenie 2×2 km), BDOT10k | spadek ≥ 3% (+1), ≥ 8% (+1); wody+lasy+gleby organiczne < 10% otoczenia (+1); rów ≤ 50 m (+1) | ✅ przyczyna · 🧑‍🏫 rów · ⚠️ progi |
| Wrażliwość uprawy | *„Przy ocenie przyczyn niedoboru wody należy również uwzględnić rodzaj uprawy”* | progi IUNG dla uprawy | susza w ≥ 3/10 sezonów → „tak”, ≥ 1 → „częściowo” | ✅ przyczyna · ⚠️ progi |

## 3. Rekomendacje

### 3.1 Retencja krajobrazowa (PN: *„retain water where it falls”*, *„priorytetowe traktowanie działań zwiększających retencję przed rozważaniem nawadniania”*)

| Rekomendacja | Podstawa | Warunek w kodzie | Status |
|---|---|---|---|
| **Zatrzymaj wodę w rowie przy działce** (zastawka, sterowany odpływ) | 🧑‍🏫 mentorzy: *„wprowadzenie do rowu zamiast kopać zbiornik”*; TZ 3.2 przykład: *„spowolnienie odpływu wód w rowach melioracyjnych lub małych ciekach”*; NWRM – *Controlled drainage* | rów BDOT10k ≤ 50 m od granicy działki | ✅ 🧑‍🏫 📚 · ⚠️ 50 m |
| Sprawdź rów w okolicy (wspólna zastawka) | jw. | rów 50–300 m | ✅ · ⚠️ 300 m |
| Zatrzymaj wodę w najniższym miejscu działki (niecka, oczko) | PN: *„małe zbiorniki retencyjne … oczka wodne”*; NWRM N01 *Basins and ponds* | różnica wysokości ≥ 1 m i spadek ≥ 1%; obniżony priorytet, gdy jest rów | ✅ 📚 · ⚠️ progi |
| Pas buforowy / zadrzewienie na dolnej krawędzi | PN: *„strefy buforowe oraz zadrzewienia śródpolne”*; NWRM A02 *Buffer strips and hedges* | spadek ≥ 3% (wysoki priorytet ≥ 8%) | ✅ 📚 · ⚠️ progi |
| Dodaj elementy krajobrazu (zadrzewienia, miedze, oczka) | PN jw. | < 10% wód, lasów, gleb organicznych w otoczeniu | ✅ · ⚠️ 10% |

### 3.2 Retencja glebowa (PN: *„stosowanie międzyplonów, pozostawianie resztek pożniwnych, ograniczanie intensywnej uprawy oraz zwiększanie zawartości materii organicznej”*)

| Rekomendacja | Podstawa | Warunek | Status |
|---|---|---|---|
| Zwiększaj / utrzymuj materię organiczną | PN (cytat wyżej); Minasny i in. 2017 „4 per mille” (bibliografia PN) | SOC < 2% albo gleba lekka (kat. I–II lub piasek ≥ 60%) | ✅ 📚 · ⚠️ progi |
| Międzyplony i okrywa gleby | PN; TZ 3.2 przykład: *„warto rozważyć zastosowanie międzyplonów, pozostawianie resztek pożniwnych”*; NWRM A08 *Green cover* | zawsze (priorytet wysoki przy suszy ≥ 3/10 lub glebie lekkiej) | ✅ 📚 |

### 3.3 Agrotechnika

| Rekomendacja | Podstawa | Warunek | Status |
|---|---|---|---|
| Ogranicz intensywną uprawę (uproszczona / bezorkowa) | PN: *„ograniczanie intensywnej uprawy”*; NWRM A06/A07 *No till / Low till* | susza ≥ 2/10, bieżąca susza, lub gleba lekka | ✅ 📚 · ⚠️ progi |
| Przygotuj się na okres X (monitoring, odmiany, termin siewu) | TZ 3.2 przykład: *„Największe ryzyko niedoboru wody na tej działce występuje w okresie od maja do lipca. W tym czasie zaleca się szczególny monitoring”*; NWRM A09 *Early sowing* | najczęstszy okres suszy z historii | ✅ 📚 |
| Rozważ uprawy mniej narażone | TZ 1: *„decyzje dotyczące … doboru upraw”*; progi IUNG dla 14 upraw liczone na tych samych danych | susza ≥ 3/10 i są uprawy z mniejszą liczbą | ✅ 📚 · ⚠️ próg |

### 3.4 Nawadnianie (TZ 3.2 pkt 3, opcjonalne: *„wskazówki dotyczące zasadności, terminu i zakresu nawadniania”*)

| Element | Podstawa | Status |
|---|---|---|
| Dzienny bilans wody w strefie korzeni (Dr, TAW, RAW = p·TAW) | FAO-56, rozdz. 8 | 📚 |
| Kc (Tabela 12), Zr i p (Tabela 22) dla 13 upraw | FAO-56 – **zweryfikowane w źródle** (fao.org/4/x0490e, 2026-11-21). Zr: dolne wartości zakresu, zgodnie z FAO *„smaller values for irrigation scheduling”* | 📚 |
| Tytoń: Kc, Zr, p | **brak w tabelach FAO-56** – przyjęte przez analogię do warzyw | ⚠️ |
| Opad efektywny = 0,8·P dla dni > 2 mm | uproszczenie | ⚠️ |
| Dawka maks. 30 mm, zaokrąglona do 5 mm | praktyka nawodnieniowa – brak cytowanego źródła | ⚠️ |
| Brak nawadniania przy Kc ≤ 0,5 (początek wegetacji / dojrzewanie) | reguła agronomiczna zespołu | ⚠️ |
| Woda gleby: AWC z Saxton & Rawls; zapas przy braku SoilGrids: I 70, II 100, III 140, IV 170 mm/m | Saxton & Rawls 📚; wartości zapasowe ⚠️ | 📚 / ⚠️ |
| Prognoza 7 dni (wstrzymaj się, gdy nadchodzi deszcz) | Open-Meteo; logika: opad prognozowany ≥ 80% niedoboru | 📚 dane · ⚠️ 80% |

### 3.5 Ostrzeżenia prawne przy rekomendacjach

| Tekst | Weryfikacja | Status |
|---|---|---|
| Pobór wody do nawadniania > zwykłe korzystanie → może wymagać pozwolenia | Wody Polskie: zwykłe korzystanie do średnio 5 m³/dobę; nawadnianie = usługa wodna → pozwolenie | 📚 zweryfikowane |
| Staw / zbiornik → zgłoszenie lub pozwolenie | Wody Polskie: staw napełniany wodami opadowymi/gruntowymi – zgłoszenie (progi powierzchni podawane różnie: 500–5000 m²) → w aplikacji celowo bez liczby | 📚 · tekst ostrożny |
| Zastawka na rowie → uzgodnienie z zarządcą + zgłoszenie albo pozwolenie (decyduje nadzór wodny) | Wody Polskie: urządzenie melioracji wodnej wymaga zgłoszenia lub pozwolenia | 📚 (poprawione 2026-11-21: było „zwykle zgłoszenie”) |

---

## 4. Co poprawiono w trakcie audytu

1. **Zr zbóż ozimych** 1,0 m → **1,5 m** (FAO-56 Tab. 22: 1,5–1,8 m).
2. **Tytoń** – oznaczony w kodzie jako założenie (brak w FAO-56).
3. **Zastawka** – tekst prawny: „zgłoszenie albo pozwolenie, decyduje nadzór wodny” zamiast „zwykle zgłoszenie”.

## 5. Do decyzji / potwierdzenia z mentorem

Wszystkie ⚠️ to progi decyzyjne zespołu. Są ostrożne i uzasadnione zdroworozsądkowo, ale **nie pochodzą z dokumentów KOWR ani literatury**. Propozycja:
- zapytać dr. inż. Bolewskiego o progi: spadek terenu (3% / 8%), SOC (1,2% / 2%), AWC (110 mm), odległość rowu (50 m / 300 m), „blisko progu” (30 mm);
- w README wypisać je w sekcji „Założenia i ograniczenia” jako parametry konfigurowalne.

## Źródła
- KOWR – Treść zadania konkursowego; KOWR – Podstawy naukowe (Załącznik 1)
- Rozporządzenie MRiRW z 11.04.2019 (Dz.U. 2019 poz. 739); IUNG-PIB SMSR – [wartości progowe KBW](https://susza.iung.pulawy.pl/progi/)
- Allen i in., FAO-56 – [Tabela 12](https://www.fao.org/4/x0490e/x0490e0b.htm), [Tabela 22](https://www.fao.org/4/x0490e/x0490e0e.htm)
- Saxton & Rawls 2006, SSSAJ 70:1569–1578; implementacja USDA WEPP [`saxpar.for`](https://infosys.ars.usda.gov/svn/code/weps1/branches/weps.src.wepp/src/lib_wepp/saxpar.for)
- [Katalog NWRM](https://nwrm.eu/measures-catalogue), [NWRM – rolnictwo](https://www.nwrm.eu/sectors/agriculture)
- Wody Polskie: [zgłoszenie wodnoprawne](https://www.gov.pl/wody-polskie/zgloszenie-wodnoprawne), [pozwolenie wodnoprawne](https://www.gov.pl/wody-polskie/pozwolenie-wodnoprawne), [pobór wód w ramach zwykłego korzystania](https://www.gov.pl/web/wody-polskie-szczecin/pobor-wod-w-ramach-zwyklego-korzystania-a-wymog-posiadania-pozwolenia-wodnoprawnego), [melioracje wodne (broszura)](https://wody.gov.pl/images/Melioracje/melioracje_wodne-A5-4_kwietnia_2022.pdf)
