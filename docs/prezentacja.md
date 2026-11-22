# Prezentacja – plan 10 slajdów

Gotowy PDF: **`docs/prezentacja.pdf`** (wygenerowany z `docs/prezentacja/deck.html`). Ten dokument opisuje każdy slajd: cel, treść, grafikę i co powiedzieć.

**Dwa zastosowania tej samej prezentacji:**
- **PDF dla jury (etap 1)** – czytany bez prelegenta, więc każdy slajd musi się bronić sam: tytuł = teza, zrzut ekranu, 2–4 krótkie punkty.
- **Finał (etap 2): 2–3 min + do 2 min pytań** – mówimy tylko slajdy 1, 3, 6, 7, 8 i przechodzimy do demo na żywo (scenariusz niżej).

Styl: biały tył, zieleń marki `#15803d`, font Lato, zrzuty w ramce z cieniem, bez gradientów i ikon dla ozdoby. Format 16:9.

**Pokrycie kryteriów oceny:**

| Kryterium (waga) | Slajdy |
|---|---|
| Wartość praktyczna dla rolnika (25%) | 3, 5, 6, 10 |
| Dane i wiarygodność rekomendacji (25%) | 4, 5, 8, 9 |
| Innowacyjność i potencjał (20%) | 6, 7, 10 |
| Prostota obsługi (15%) | 3, 9 |
| Prototyp i jakość techniczna (15%) | 3, 8, 9 |

---

## 1. Tytuł

- **Teza:** Retentoor – zatrzymaj wodę na swoim polu.
- **Podtytuł:** Numer działki → uprawa → raport w kilka sekund. Z otwartych danych z 10 lat.
- **Grafika:** logo + duży zrzut raportu (`screens/02-raport-gora.png`).
- **Stopka:** HackNation 2026 · zadanie KOWR „Zatrzymaj wodę, chroń plony” · zespół AGH_BIT_OMEGA.
- **Powiedz (10 s):** „Retentoor mówi rolnikowi, czy jego działce grozi susza, dlaczego, i gdzie oraz ile wody może zatrzymać – zanim zapłaci za nawadnianie.”

## 2. Problem

- **Teza:** Susza wraca co kilka lat, a dane, które mogą pomóc, są rozproszone.
- **Punkty:**
  - Na glebach lekkich susza rolnicza dotyka uprawy w kilku sezonach na dziesięć (przykład z aplikacji: Murowana Goślina, kukurydza – 2 z 10 lat, ziemniak – 4 z 10).
  - Dane są w 5 kategoriach u wielu dostawców: IUNG, GUGiK, Copernicus, serwisy pogodowe.
  - Rolnik nie ma czasu ani narzędzi GIS; doradca nie ma ich dla każdej działki.
  - Nawadnianie jest drogie i wymaga pozwoleń – najpierw trzeba zatrzymać wodę, która już spada.
- **Grafika:** 5 kafelków kategorii danych z nazwami dostawców (bez zrzutu).
- **Powiedz (15 s).**

## 3. Rozwiązanie: 3 kroki, 5 etapów raportu

- **Teza:** Trzy kroki dla rolnika, pięć etapów analizy w kolejności KOWR.
- **Lewa strona:** 1) działka – numer albo kliknięcie na mapie, 2) uprawa – 14 grup IUNG, 3) data – dziś, dowolny dzień z 10 lat albo do 16 dni naprzód.
- **Pasek etapów:** ocena sytuacji wodnej → przyczyny → retencja krajobrazowa → gleba i agrotechnika → nawadnianie.
- **Grafika:** `screens/01-start.png` (wybór działki) + `screens/18-mobile-raport.png` (telefon).
- **Powiedz (20 s):** „Bez konta, w przeglądarce i na telefonie. Raport jest w języku rolnika, a każda liczba ma źródło.”

## 4. Ocena sytuacji wodnej – metoda IUNG

- **Teza:** Ta sama metoda co państwowy System Monitoringu Suszy Rolniczej.
- **Punkty:**
  - Klimatyczny bilans wodny (opad − parowanie) w okresach 60 dni, progi suszy z Dz.U. 2019 poz. 739 dla uprawy i kategorii gleby.
  - Osobno: susza teraz i podatność z 10 lat (w których latach i okresach).
  - Decyzja o nawadnianiu z bilansu FAO-56 i prognozy opadów na 7 dni – z dawką w mm.
- **Grafika:** `screens/03-ocena.png` (werdykt „Susza rolnicza dla tej uprawy”, KBW −197 mm vs próg −188 mm) + fragment `screens/04-historia.png`.

## 5. Przyczyny i działania z uzasadnieniem

- **Teza:** Każda rekomendacja wynika z danych tej działki – i mówi, z których.
- **Punkty:**
  - 4 typy przyczyn z Załącznika: opady i temperatura, gleba, odpływ, wrażliwość uprawy – z dowodami liczbowymi.
  - Działania w kolejności: krajobraz (rowy, oczka, pasy buforowe) → gleba (materia organiczna, międzyplony) → agrotechnika → nawadnianie.
  - Przy działaniach: priorytet, podstawa naukowa (NWRM, CDR 2025, FAO-56), formalności z Prawa wodnego, punkt na mapie.
- **Grafika:** `screens/06-rekomendacje.png` (+ `05-przyczyny.png` mniejszy).

## 6. Woda na działce – którędy ucieka i ile zatrzymasz ★

- **Teza:** Pokazujemy, którędy woda ucieka z pola – i ile m³ zatrzyma każde działanie.
- **Punkty:**
  - Model spływu na numerycznym modelu terenu GUGiK: drogi spływu, miejsca ucieczki wody (np. „51% spływu ucieka na południe”), zagłębienia, grunty spływające na pole.
  - Najlepsze miejsce na oczko – tam, gdzie zbiera się najwięcej wody.
  - „Ile wody zatrzymasz”: zastawka ~530 m³ na sezon, oczko ~200 m³ z każdej ulewy, materia organiczna ~35 m³/ha na stałe – z jawnymi założeniami.
- **Grafika:** `screens/09-woda-pluznica.png` (duży) + `screens/10-woda-trzcianne.png` (mały).
- **Powiedz (30 s):** „To nasz wyróżnik. Rolnik widzi na zdjęciu swojego pola, gdzie postawić zastawkę albo wykopać oczko, i ile to da wody – w metrach sześciennych i w dniach podlewania.”

## 7. Satelita: potwierdzenie i cały sezon

- **Teza:** Sentinel-2 niezależnie potwierdza ocenę – i pokazuje cały sezon pola.
- **Punkty:**
  - Wilgotność (NDMI) i zieleń (NDVI) roślin na tle tej samej pory roku w poprzednich latach, z maską chmur.
  - Interpretacja zależy od uprawy: po żniwach niski NDVI to nie susza.
  - Animacja sezonu: każde bezchmurne zdjęcie od marca do października z wykresem.
- **Grafika:** `screens/12-sezon.png` + `screens/13-satelita-ndmi.png`.

## 8. Dane i wiarygodność: skąd pewność wyniku

- **Teza:** 14 otwartych usług w 5 kategoriach – i uczciwa informacja, na ile ufać wynikowi.
- **Punkty:**
  - Pewność: start „wysoka”, minus za każdy brak – brak kategorii gleby (−2), gleba organiczna lub nierolnicza, niepełne dane pogodowe, pogoda z zapasowego NASA POWER (~50 km zamiast 9–25 km), data > 7 dni naprzód.
  - Ta sama działka może mieć raz pewność wysoką, a raz średnią – gdy Open-Meteo limituje zapytania, aplikacja przełącza się na NASA POWER i to pokazuje.
  - Każde źródło w raporcie z datą pobrania, zakresem i licencją; brakujące dane wypisane wprost.
- **Grafika:** tabela 5 kategorii × źródła + `screens/08-zrodla-raportu.png`.
- **Powiedz (25 s):** wymagany punkt – wyjaśnić, dlaczego pewność się zmienia (Open-Meteo vs NASA POWER, cache, brakujące źródła).

## 9. Jak powstaje raport (karuzela ze „Źródła i metoda”)

- **Teza:** Pięć kroków od numeru działki do rekomendacji – każdy z jawnym źródłem.
- **Grafika:** `screens/22-karuzela-raportu.png` – karuzela kroków z widoku „Źródła i metoda” (`/zrodla`), na przodzie krok 2 „Bilans wodny”.
- **Pod spodem 5 kafelków** (PDF czytany bez klikania, więc każdy krok opisany wprost):
  1. Działka – ULDK, ortofotomapa GUGiK.
  2. Bilans wodny – opad minus ET₀ (FAO-56) w oknach 60 dni z 10 lat, progi IUNG-PIB; Open-Meteo / NASA POWER.
  3. Przyczyny – IUNG-PIB, SoilGrids, NMT, BDOT10k.
  4. Działania – reguły NWRM, CDR 2025, prognoza 7 dni; kolejność KOWR.
  5. Kontrola z satelity – Copernicus Sentinel-2 (NDMI, NDVI).
- Dawny slajd „Prototyp i technologia” usunięty (limit 10 slajdów); architektura, czasy i odporność są w README.

## 10. Wartość i dalszy rozwój

- **Teza:** Narzędzie gotowe do pilotażu z doradcami KOWR i ODR.
- **Dla rolnika:** mniej strat przez suszę, tańsze działania najpierw, decyzja o nawadnianiu z liczbami.
- **Dla KOWR / doradztwa:** jednolita, uzasadniona ocena dla każdej działki w Polsce; link do raportu zamiast wizyty.
- **Dalej:** prognoza ryzyka suszy na resztę sezonu (analogi klimatyczne, SARIMAX), wspólne zastawki dla działek przy tym samym rowie, powiązanie z ekoschematami i naborami ARiMR, stacje IMGW do walidacji.
- **Grafika:** `screens/16-dzialania.png` + hasło „Zatrzymaj wodę, chroń plony.” (bez linku do prototypu).
- **Powiedz (10 s):** „Dziękujemy – pokażemy to na żywo na Państwa działce.”

---

## Finał: scenariusz 2:30 min

| Czas | Co | Slajd / ekran |
|---|---|---|
| 0:00–0:15 | Problem i teza | slajd 1 |
| 0:15–0:35 | 3 kroki, kolejność KOWR | slajd 3 |
| 0:35–1:35 | **Demo na żywo:** działka od jury → uprawa → raport: werdykt, KBW na tle progu, „Woda na działce” (gdzie ucieka, ile zatrzymasz), rekomendacje z mapą | aplikacja |
| 1:35–2:00 | Satelita: sezon z satelity (odtwarzanie) | aplikacja |
| 2:00–2:20 | Skąd pewność wyniku (Open-Meteo vs NASA POWER, brakujące dane) | slajd 8 |
| 2:20–2:30 | Wartość i dalszy rozwój | slajd 10 |

**Przed finałem:** uruchomić aplikację z hotspota telefonu (sieć wydarzenia bywa limitowana przez GUGiK i Open-Meteo), otworzyć raporty z demo (rozgrzeje cache satelity i sezonu), sprawdzić stronę „Źródła i metoda” – czy wszystkie usługi działają.

**Pytania, które mogą paść:**
- *Czym różnicie się od SMSR IUNG?* – SMSR daje mapę dla gmin; my liczymy tę samą metodę dla konkretnej działki i dokładamy przyczyny, spływ, m³ i plan działań.
- *Skąd wiecie, że wynik jest dobry?* – ta sama metoda i progi co IUNG, dwa źródła pogody, potwierdzenie z satelity, jawne założenia i pewność (README, sekcja 9).
- *Co jeśli usługa padnie?* – źródła zapasowe, cache, baner; pewność spada, raport działa.
- *Ile to kosztuje?* – dane 0 zł; dla produkcji płatny plan Open-Meteo.
- *Czy jest AI?* – nie w obliczeniach (jawne reguły); AI jako asystent programisty.
