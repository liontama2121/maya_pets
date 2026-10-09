import { matchScore, type DogCardData, type GuideAnswers } from "@maya/api/adoption";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { useMemo, useState } from "react";
import { DogCard } from "../../components/shared/DogCard";

/**
 * Guía de Maya: 4 preguntas y Maya sugiere los perritos que encajan con el hogar.
 * La compatibilidad se calcula en el navegador con reglas simples (no se guarda nada).
 */

type Step = {
  key: keyof GuideAnswers;
  question: string;
  hint: string;
  options: { value: string | boolean; label: string }[];
};

const STEPS: Step[] = [
  {
    key: "hogar",
    question: "¿Cómo es tu hogar?",
    hint: "Para saber cuánto espacio tendría para estirarse.",
    options: [
      { value: "apartamento", label: "Apartamento pequeño" },
      { value: "apartamento_grande", label: "Apartamento amplio" },
      { value: "casa_patio", label: "Casa con patio o finca" },
    ],
  },
  {
    key: "mascotas",
    question: "¿Tienes otras mascotas?",
    hint: "Algunos perritos aman la compañía; otros prefieren ser los únicos.",
    options: [
      { value: "ninguna", label: "No, sería la primera" },
      { value: "perros", label: "Sí, perros" },
      { value: "gatos", label: "Sí, gatos" },
      { value: "ambos", label: "Perros y gatos" },
    ],
  },
  {
    key: "tiempo",
    question: "¿Cuánto tiempo pasas en casa?",
    hint: "Los cachorros y los muy activos necesitan más compañía.",
    options: [
      { value: "poco", label: "Poco: salgo todo el día" },
      { value: "medio", label: "Medio: salgo unas horas" },
      { value: "mucho", label: "Mucho: trabajo desde casa" },
    ],
  },
  {
    key: "ritmo",
    question: "¿Cómo te gusta pasar el tiempo?",
    hint: "Para encontrar a alguien con tu mismo ritmo.",
    options: [
      { value: "tranquilo", label: "Tranquilo: sofá y series" },
      { value: "paseos", label: "Paseos por el barrio" },
      { value: "deporte", label: "Trotar, montaña, parque" },
    ],
  },
];

export default function MayaGuide({ dogs }: { dogs: DogCardData[] }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<GuideAnswers>>({});
  const [kids, setKids] = useState(false);
  const done = step >= STEPS.length;

  const results = useMemo(() => {
    if (!done) return [];
    const a = { ...answers, ninos: kids } as GuideAnswers;
    return dogs
      .map((dog) => ({ dog, match: matchScore(dog, a) }))
      .sort((x, y) => y.match.score - x.match.score)
      .slice(0, 3);
  }, [done, answers, kids, dogs]);

  const choose = (value: string | boolean) => {
    const s = STEPS[step]!;
    setAnswers((a) => ({ ...a, [s.key]: value }));
    setStep((n) => n + 1);
  };

  const current = STEPS[step];

  return (
    <section aria-labelledby="guia-maya" className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-sun-400 text-teal-900 shadow-[inset_0_-4px_0_var(--color-sun-600)]">
          <PawPrint weight="fill" size={28} aria-hidden="true" />
        </span>
        <div>
          <h2 id="guia-maya" className="text-2xl font-bold [font-variation-settings:'wght'_720]">
            Maya te ayuda a elegir
          </h2>
          <p className="text-ink-soft">
            {done ? "Estos son los que mejor encajan contigo." : "Cuatro preguntas y Maya olfatea quién encaja con tu hogar."}
          </p>
        </div>
      </div>

      {!done && current && (
        <div className="mt-6">
          <div className="mb-4 flex items-center gap-2" aria-hidden="true">
            {STEPS.map((_, i) => (
              <PawPrint key={i} weight="fill" size={20} className={i <= step ? "text-teal-700" : "text-line"} />
            ))}
          </div>
          <fieldset>
            <legend className="text-xl font-semibold">
              <span className="sr-only">
                Pregunta {step + 1} de {STEPS.length}:{" "}
              </span>
              {current.question}
            </legend>
            <p className="mt-1 text-sm text-ink-soft">{current.hint}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {current.options.map((o) => (
                <button key={String(o.value)} type="button" className="chip !min-h-14 justify-start !rounded-2xl !px-4 text-left" onClick={() => choose(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            {step === 0 && (
              <label className="mt-4 flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-5 accent-teal-700" checked={kids} onChange={(e) => setKids(e.target.checked)} />
                Hay niños en la casa
              </label>
            )}
          </fieldset>
          {step > 0 && (
            <button type="button" className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-medium text-teal-700" onClick={() => setStep((n) => n - 1)}>
              <ArrowLeft size={18} aria-hidden="true" /> Atrás
            </button>
          )}
        </div>
      )}

      {done && (
        <div className="mt-6" aria-live="polite">
          {results.length === 0 ? (
            <p className="text-ink-soft">Ahora mismo no hay perritos disponibles. Escríbenos y te avisamos cuando llegue alguien.</p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-3">
              {results.map(({ dog, match }) => (
                <li key={dog.id}>
                  <DogCard dog={dog} match={match} />
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-soft btn-sm mt-6"
            onClick={() => {
              setStep(0);
              setAnswers({});
            }}
          >
            Volver a empezar
          </button>
        </div>
      )}
    </section>
  );
}
