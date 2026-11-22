# Zgłoszenie – teksty do wklejenia na Platformę konkursową

Zgodnie z sekcją 4.1 treści zadania. Nazwa zespołu **bez imion i nazwisk** (Regulamin).

## Nazwa zespołu

AGH_BIT_OMEGA

## Tytuł rozwiązania

**Retentoor – asystent retencji wody dla rolnika**

## Zwięzły opis rozwiązania

**Problem.** Susza rolnicza powtarza się w Polsce co kilka lat, a rolnik nie ma prostego narzędzia, które dla jego konkretnej działki powie, jak jest z wodą teraz, jak często bywało źle i co zrobić, zanim sięgnie po kosztowne nawadnianie. Potrzebne dane istnieją, ale są rozproszone między IUNG, GUGiK, Copernicus i serwisy pogodowe i wymagają wiedzy GIS.

**Główne funkcjonalności.**
- Trzy kroki: numer działki albo kliknięcie na mapie → uprawa → data (dziś, dowolny dzień z 10 lat albo do 16 dni naprzód).
- Raport w kolejności z Załącznika naukowego: ocena sytuacji wodnej (metoda IUNG SMSR) → przyczyny → retencja krajobrazowa → retencja glebowa i agrotechnika → nawadnianie (bilans FAO-56 z dawką w mm i prognozą opadów).
- Mapa spływu wody z modelu terenu: którędy woda ucieka z pola, gdzie się zbiera, ile gruntów spływa na działkę i gdzie najlepiej zrobić oczko.
- „Ile wody zatrzymasz” – objętość w m³ dla zastawki na rowie, oczka i materii organicznej, przeliczona na dni zapotrzebowania uprawy.
- Potwierdzenie z satelity Sentinel-2 (wilgotność i zieleń roślin na tle poprzednich lat) i animacja całego sezonu.
- Historia suszy z 10 lat i porównanie 14 upraw na tej działce.
- Poziom pewności, brakujące dane, ograniczenia i źródła z datami w każdym raporcie; druk i PDF; link do udostępnienia.
- Moje pola (wszystkie działki na jednej mapie, bez konta), katalog działań retencyjnych, opis źródeł i metody.

**Sposób wykorzystania danych.** Wszystko pobierane na żywo z darmowych, legalnych źródeł: pogoda z 21 lat (Open-Meteo ERA5, zapasowo NASA POWER) i prognoza (Open-Meteo, zapasowo MET Norway); satelita Sentinel-2 L2A (Copernicus, Earth Search); gleba (kategorie IUNG-PIB, ISRIC SoilGrids); hydrologia (rowy BDOT10k, wody i mokradła IUNG, model spływu D8 na NMT); dane przestrzenne (ULDK, NMT, ortofotomapa GUGiK). Ocena suszy używa okresów i wartości krytycznych KBW z Rozporządzenia MRiRW (Dz.U. 2019 poz. 739). Każda rekomendacja wynika z warunku na zmierzonych danych i podaje liczby, które ją uzasadniają. Bez modeli AI w działaniu – wszystkie wyniki są jawne i powtarzalne.

**Najważniejsze korzyści dla użytkownika.**
- Konkretne działania z miejscem na mapie i liczbami zamiast ogólników.
- Najpierw tanie zatrzymanie wody (rowy, oczka, gleba), nawadnianie dopiero na końcu i tylko wtedy, gdy ma sens.
- Zrozumiały język, bez GIS; działa na telefonie w polu.
- Uczciwa informacja o niepewności i źródłach – rolnik i doradca wiedzą, na ile ufać wynikowi.
- Bez konta i bez danych osobowych.

## Repozytorium

[LINK DO PRYWATNEGO REPOZYTORIUM] – dostęp dla jury zgodnie z instrukcją na Platformie.

## Działający prototyp

https://headwear-composure-upbeat.ngrok-free.dev (przy pierwszym wejściu kliknij „Visit Site”) albo instrukcja uruchomienia: README, sekcja 1.

## Załączniki

- Prezentacja PDF (10 slajdów): `docs/prezentacja.pdf`
- Film do 3 minut: [LINK]
- Wygenerowane raporty: `docs/raporty/*.pdf`
- Zrzuty ekranu: `docs/screens/`
