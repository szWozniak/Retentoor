import { Link } from 'react-router-dom'
import { ArrowRight, Droplets, FileWarning, Landmark, Mountain, Sprout, Tractor, Trees } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Catalogue of the measures Retentoor can recommend, in the KOWR order: landscape → soil → agrotechnics → irrigation.
 * Same wording and conditions as the rule set in backend/app/services/advisor.py, so the page explains the report.
 * Costs are deliberately qualitative (they depend on the site); funding names refer to PS WPR 2023–2027.
 */

type Cost = 'bez kosztów' | 'niski' | 'średni' | 'wysoki'
type Measure = {
  title: string
  what: string
  effect: string
  when: string // the condition on measured data that makes the app suggest it
  cost: Cost
  permit?: string
  funding?: string
}
type Stage = { id: string; n: number; title: string; lead: string; icon: typeof Trees; measures: Measure[] }

const STAGES: Stage[] = [
  {
    id: 'krajobraz',
    n: 1,
    title: 'Retencja krajobrazowa',
    lead: 'Najpierw zatrzymaj wodę, która już spada na pole i w okolicy, zanim odpłynie rowem.',
    icon: Trees,
    measures: [
      {
        title: 'Zastawka lub próg na rowie melioracyjnym',
        what: 'Spiętrzenie wody w istniejącym rowie (sterowany odpływ). Wiosną zatrzymuje wodę z roztopów, latem ogranicza przesuszanie pola.',
        effect: 'Podnosi poziom wód gruntowych w pasie przy rowie; zwykle tańsze i szybsze niż nowy zbiornik.',
        when: 'Rów melioracyjny (BDOT10k) styka się z działką albo jest bliżej niż 50 m.',
        cost: 'niski',
        permit: 'Uzgodnienie z zarządcą rowu (spółka wodna, gmina lub Wody Polskie) oraz zgłoszenie albo pozwolenie wodnoprawne.',
      },
      {
        title: 'Niecka lub oczko w najniższym miejscu działki',
        what: 'Płytkie zagłębienie, oczko śródpolne lub pas trwałej roślinności tam, gdzie spływa woda opadowa.',
        effect: 'Woda wsiąka na miejscu zamiast spływać poza pole; zatrzymuje też glebę i nawozy.',
        when: 'Różnica wysokości na działce co najmniej 1 m i nachylenie co najmniej 1% (NMT GUGiK). Miejsce pokazujemy na mapie.',
        cost: 'średni',
        permit: 'Staw lub zbiornik może wymagać zgłoszenia albo pozwolenia wodnoprawnego (Wody Polskie).',
      },
      {
        title: 'Pas buforowy lub zadrzewienie na dolnej krawędzi pola',
        what: 'Kilkumetrowy pas trawy, krzewów lub drzew wzdłuż najniżej położonej granicy działki.',
        effect: 'Spowalnia spływ powierzchniowy i erozję; osłania pole przed wiatrem, więc mniej wody paruje.',
        when: 'Średnie nachylenie działki co najmniej 3%.',
        cost: 'niski',
      },
      {
        title: 'Zadrzewienia śródpolne, miedze i mokradła',
        what: 'Elementy krajobrazu planowane razem z sąsiadami: pasy drzew, miedze, ochrona istniejących oczek.',
        effect: 'Mniejsze parowanie z pól i wolniejszy odpływ z całej zlewni, nie tylko z jednej działki.',
        when: 'W promieniu ok. 1 km wody, lasy i gleby organiczne zajmują mniej niż 10% powierzchni.',
        cost: 'średni',
      },
    ],
  },
  {
    id: 'gleba',
    n: 2,
    title: 'Retencja glebowa',
    lead: 'Gleba to największy i najtańszy magazyn wody na polu.',
    icon: Sprout,
    measures: [
      {
        title: 'Więcej materii organicznej',
        what: 'Resztki pożniwne zostają na polu, do tego obornik, kompost i nawozy naturalne.',
        effect: 'Każdy dodatkowy procent materii organicznej to kilka milimetrów wody więcej w glebie, trwale.',
        when: 'Węgiel organiczny poniżej 2% (SoilGrids) albo gleba lekka (kategoria IUNG I–II lub ponad 60% piasku).',
        cost: 'bez kosztów',
        funding: 'Ekoschemat „Rolnictwo węglowe i zarządzanie składnikami odżywczymi”, m.in. praktyka wymieszania słomy z glebą.',
      },
      {
        title: 'Międzyplony i okrywa gleby',
        what: 'Międzyplon ścierniskowy lub ozimy po zbiorze, mulcz z resztek roślinnych.',
        effect: 'Okryta gleba paruje mniej i lepiej chłonie deszcz; korzenie poprawiają strukturę.',
        when: 'Zawsze; priorytet wysoki, gdy susza była w co najmniej 3 z ostatnich sezonów albo gleba jest lekka.',
        cost: 'niski',
        funding: 'Ekoschemat „Rolnictwo węglowe…”: praktyka międzyplonów ozimych lub wsiewek śródplonowych.',
      },
    ],
  },
  {
    id: 'agro',
    n: 3,
    title: 'Agrotechnika',
    lead: 'Mniej zabiegów przesuszających glebę i uprawy dopasowane do ryzyka.',
    icon: Tractor,
    measures: [
      {
        title: 'Uprawa uproszczona zamiast intensywnej',
        what: 'Rezygnacja z głębokiej orki przed suchym okresem, uprawa bezorkowa lub pasowa.',
        effect: 'Każdy zabieg przesusza wierzchnią warstwę; mniej zabiegów to więcej wody dla roślin.',
        when: 'Susza w co najmniej 2 z ostatnich sezonów, bieżący niedobór wody albo gleba lekka.',
        cost: 'bez kosztów',
        funding: 'Ekoschemat „Rolnictwo węglowe…”: praktyka uproszczonych systemów uprawy.',
      },
      {
        title: 'Termin siewu i odmiany pod krytyczny okres',
        what: 'Odmiany tolerancyjne na suszę i taki termin siewu, by rośliny ukorzeniły się przed najsuchszym okresem.',
        effect: 'Roślina sięga głębiej po wodę akurat wtedy, gdy na tej działce najczęściej jej brakuje.',
        when: 'Analiza 10 lat wskazuje okres, w którym susza powtarza się najczęściej (progi KBW IUNG).',
        cost: 'bez kosztów',
      },
      {
        title: 'Uprawy mniej narażone na suszę',
        what: 'Przy planowaniu płodozmianu uwzględnij uprawy, które na tej glebie rzadziej cierpiały z braku wody.',
        effect: 'Mniejsze straty plonu bez inwestycji – porównanie 14 grup upraw na tej samej działce.',
        when: 'Wybrana uprawa miała suszę w co najmniej 3 sezonach, a inne grupy upraw wyraźnie rzadziej.',
        cost: 'bez kosztów',
      },
    ],
  },
  {
    id: 'nawadnianie',
    n: 4,
    title: 'Nawadnianie',
    lead: 'Na końcu – gdy woda zatrzymana w krajobrazie i glebie nie wystarcza.',
    icon: Droplets,
    measures: [
      {
        title: 'Nawadnianie z dawką z bilansu wodnego',
        what: 'Decyzja „zasadne / wstrzymaj się / niezasadne” i dawka w mm z bilansu wody w strefie korzeni (FAO-56), z uwzględnieniem prognozy opadów na 7 dni.',
        effect: 'Podlewasz tylko wtedy, gdy roślina naprawdę traci wodę, i tylko tyle, ile trzeba.',
        when: 'Uprawa jest w polu, a zużycie wody przekracza łatwo dostępny zapas w glebie.',
        cost: 'wysoki',
        permit: 'Pobór wody ponad zwykłe korzystanie z wód może wymagać pozwolenia wodnoprawnego – sprawdź w Wodach Polskich.',
        funding: 'Inwestycje w nawadnianie: interwencje PS WPR obsługiwane przez ARiMR – sprawdź aktualne nabory.',
      },
    ],
  },
]

/** cost as 1–3 dollar signs, green = how many count ("bez kosztów" = all grey) */
const COST_LEVEL: Record<Cost, number> = { 'bez kosztów': 0, niski: 1, średni: 2, wysoki: 3 }

function CostMeter({ cost }: { cost: Cost }) {
  const n = COST_LEVEL[cost]
  return (
    <span className="flex shrink-0 font-mono text-lg leading-none font-bold tracking-tighter" title={`Koszt: ${cost}`}>
      <span className="sr-only">Koszt: {cost}</span>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? 'text-primary' : 'text-border'} aria-hidden>
          $
        </span>
      ))}
    </span>
  )
}

function MeasureCard({ m }: { m: Measure }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="min-w-0">{m.title}</span>
          <CostMeter cost={m.cost} />
        </CardTitle>
        <CardDescription>{m.effect}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p className="bg-muted rounded-md px-3 py-2">
          <span className="text-muted-foreground">W raporcie, gdy: </span>
          {m.when}
        </p>
        {m.permit && (
          <p className="text-muted-foreground flex gap-2">
            <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden /> {m.permit}
          </p>
        )}
        {m.funding && (
          <p className="text-muted-foreground flex gap-2">
            <Landmark className="mt-0.5 size-4 shrink-0" aria-hidden /> {m.funding}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function MeasuresPage() {
  return (
    <div className="grid gap-8">
      <div className="max-w-3xl">
        <h1 className="type-headline sm:type-display">Działania retencyjne</h1>
        <p className="text-muted-foreground mt-1 text-pretty">
          Co Retentoor może zaproponować dla działki – w kolejności KOWR: najpierw zatrzymać wodę, nawadniać na końcu.
        </p>
      </div>

      {/* the KOWR sequence as a zigzag path: big icons, alternately high and low, joined by a dashed curve */}
      <nav aria-label="Etapy" className="relative">
        <svg
          className="text-primary/30 pointer-events-none absolute inset-x-0 top-0 hidden h-[136px] w-full md:block"
          viewBox="0 0 400 136"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M50,44 C100,44 100,92 150,92 S200,44 250,44 S300,92 350,92"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ol className="relative grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
          {STAGES.map((s, i) => (
            <li key={s.id} className={cn(i % 2 === 1 && 'mt-12')}>
              <a href={`#${s.id}`} className="group flex flex-col items-center gap-2 text-center no-underline">
                <span className="bg-card text-primary border-primary-container group-hover:bg-primary group-hover:text-primary-foreground relative grid size-[88px] place-items-center rounded-full border-4 shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lg">
                  <s.icon className="size-10" strokeWidth={1.75} aria-hidden />
                  <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-7 place-items-center rounded-full text-sm font-semibold">
                    {s.n}
                  </span>
                </span>
                <span className="font-semibold">{s.title}</span>
                <span className="text-muted-foreground hidden max-w-[16rem] text-sm text-pretty sm:block">{s.lead}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {STAGES.map((s) => (
        <section key={s.id} id={s.id} className="grid scroll-mt-4 gap-3">
          <div>
            <h2 className="type-title flex items-center gap-2">
              <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-full text-sm">{s.n}</span>
              {s.title}
            </h2>
          </div>
          <div className={cn('grid gap-3', s.measures.length > 1 && 'md:grid-cols-2')}>
            {s.measures.map((m) => (
              <MeasureCard key={m.title} m={m} />
            ))}
          </div>
        </section>
      ))}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Mountain className="text-primary mt-0.5 size-6 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Które z tych działań pasują do Twojego pola?</p>
              <p className="text-muted-foreground text-sm">
                Wskaż działkę – raport wybierze działania na podstawie gleby, terenu, rowów i bilansu wody z 10 lat.
              </p>
            </div>
          </div>
          <Button nativeButton={false} render={<Link to="/" />}>
            Sprawdź działkę <ArrowRight />
          </Button>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Podstawy: Natural Water Retention Measures (Komisja Europejska 2014), CDR „Melioracje, retencja i gospodarka wodna w rolnictwie” (2025), FAO-56,
        IUNG-PIB System Monitoringu Suszy Rolniczej. Koszty są orientacyjne i zależą od miejsca. Warunki ekoschematów i naborów sprawdź w ARiMR lub w ośrodku
        doradztwa rolniczego.
      </p>
    </div>
  )
}
