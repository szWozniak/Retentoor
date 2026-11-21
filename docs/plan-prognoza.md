# Plan: prognoza bilansu wodnego (na później)

Cel: oprócz oceny „na dzień analizy” pokazać, **jak prawdopodobna jest susza w kolejnych tygodniach** dla tej działki i uprawy, z jawną niepewnością.

Data analizy zostaje (wymóg PDF, rozdz. 6). Prognoza ma dwa tryby:
- **data = dziś**: prognoza na 2–6 tygodni do przodu;
- **data historyczna**: pokazujemy, co model przewidziałby wtedy, i porównujemy z tym, co się naprawdę stało. To samo daje nam weryfikację wyników (README, pkt 9).

## Dlaczego nie sam SARIMAX
Dzienny opad jest przerywany (dużo zer) i nie ma rozkładu normalnego, więc SARIMAX na dziennych danych daje słabe wyniki. Lepiej działa układ hybrydowy, a SARIMAX liczymy obok jako jeden z modeli i zostawiamy go tylko wtedy, gdy w testach wypadnie lepiej niż klimatologia.

## Model hybrydowy
1. **Dni 1–16: prognoza numeryczna.** Open-Meteo Forecast i Ensemble API (np. ECMWF IFS ENS i GFS ENS, kilkadziesiąt członków ensemble) dają P i ET₀ dziennie. Ensemble pozwala policzyć niepewność.
2. **Dalej: ensemble klimatologiczny (analogi).** Bierzemy trajektorie P i ET₀ z tych samych dni kalendarzowych z 10 poprzednich lat (z bootstrapem bloków tygodniowych) i doklejamy je po dniu 16.
3. **KBW i progi IUNG.** Dla każdego członka ensemble liczymy KBW w oknie 60 dni i porównujemy z progiem dla uprawy i gleby. Wynik to prawdopodobieństwo suszy w każdym nadchodzącym okresie dekadowym.
4. **SARIMAX (statsmodels) jako rywal.** Liczymy go na tygodniowej anomalii KBW, z członami Fouriera dla sezonowości i opcjonalnie z prognozą numeryczną jako zmienną egzogeniczną. Zostaje tylko wtedy, gdy w backteście jest lepszy od klimatologii.

## Kroki
1. **Dane.** Klient Open-Meteo Ensemble (do 35 dni) oraz opcjonalnie Seasonal, z cache i z obsługą 429. Fallback to sama klimatologia, opisana jawnie w raporcie.
2. **Baseline.** Ensemble klimatologiczny (krok 2 powyżej) i z niego prawdopodobieństwo suszy na każdy okres.
3. **Hybryda.** Doklejenie prognozy numerycznej na pierwsze 16 dni.
4. **Backtest.** Rolling origin dla 10 lat i kilku działek referencyjnych. Metryki: Brier Skill Score i CRPS względem klimatologii, wykres niezawodności. Wyniki zapisujemy w `docs/` jako dowód wiarygodności.
5. **SARIMAX.** Ten sam backtest; decyzja na podstawie liczb.
6. **UI.** Sekcja „Najbliższe tygodnie” zawiera wykres wachlarzowy KBW z progiem suszy oraz komunikat „szansa suszy w okresie 21.VI–20.VIII: 35%”. Dla dat historycznych zestawiamy prognozę z rzeczywistością.
7. **Ograniczenia w raporcie:** horyzont, rozdzielczość siatki, liczba lat w klimatologii, a przy fallbacku informacja, że prognoza oparta jest tylko na klimatologii.

## Licencje
- statsmodels: BSD-3.
- Open-Meteo: CC BY 4.0 (dane ECMWF open data: CC BY 4.0).
- Nie ma tu żadnych płatnych usług ani LLM.

## Kolejność względem innych prac
Najpierw Sentinel-2 (dane satelitarne są obowiązkowe), potem prognoza.
