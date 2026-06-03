const API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

async function callGroq(systemPrompt: string, userContent: string): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: 2048,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text: string = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('La IA no devolvió respuesta.');
  return text;
}

export async function getScheduleRecommendation(
  syllabusContent: string,
  syllabusName: string,
  customInstructions?: string
): Promise<string> {
  const system =
    'Eres un experto en técnicas de estudio y planificación académica. ' +
    'Das consejos claros, estructurados y motivadores en español.';

  let user =
    `Tengo el siguiente temario de "${syllabusName}":\n\n${syllabusContent}\n\n` +
    `Analiza el contenido y proporciona:\n` +
    `1. Un resumen de los temas principales.\n` +
    `2. Cuántas sesiones de estudio recomiendas y de qué duración.\n` +
    `3. Un plan semanal sugerido: qué estudiar cada día y en qué orden.\n` +
    `4. Técnicas de estudio más adecuadas para este tipo de contenido.`;

  if (customInstructions?.trim()) {
    user += `\n\nTen en cuenta estas instrucciones adicionales del estudiante: ${customInstructions}`;
  }

  return callGroq(system, user);
}

export type CalendarEntry = {
  date: string;   // YYYY-MM-DD
  topic: string;
  content: string;
};

export async function getDetailedStudyCalendar(
  syllabusContent: string,
  syllabusName: string,
  examDateISO: string,
  todayISO: string
): Promise<CalendarEntry[]> {
  const system =
    'Eres un planificador académico experto. ' +
    'Respondes ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional.';

  const user =
    `Hoy es ${todayISO}. El examen de "${syllabusName}" es el ${examDateISO}.\n` +
    `Crea un plan de estudio diario desde hoy (${todayISO}) hasta el día antes del examen (${examDateISO}).\n\n` +
    `Temario completo:\n${syllabusContent}\n\n` +
    `Reglas:\n` +
    `- Distribuye el contenido del temario de forma equilibrada entre los días disponibles.\n` +
    `- Para cada día, el campo "content" debe incluir el texto literal y detallado del temario que se estudia ese día, no solo un título.\n` +
    `- No incluyas el día del examen en las sesiones de estudio.\n\n` +
    `Responde ÚNICAMENTE con este JSON (sin explicaciones, sin markdown):\n` +
    `{"entries":[{"date":"YYYY-MM-DD","topic":"Nombre corto del tema","content":"Contenido detallado extraído del temario para ese día"}]}`;

  const raw = await callGroq(system, user);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolvió un JSON válido. Intenta de nuevo.');

  let parsed: { entries: CalendarEntry[] };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('Error al procesar la respuesta de la IA. Intenta de nuevo.');
  }

  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error('La IA no generó entradas de calendario. Comprueba las fechas.');
  }

  return parsed.entries;
}

export async function getMergedFolderPlan(
  folderName: string,
  syllabusPlans: Array<{ name: string; plan: string }>
): Promise<string> {
  const system =
    'Eres un experto en planificación académica. ' +
    'Recibes varias planificaciones individuales de una misma asignatura y las unificas en un plan único y coherente.';

  const plansText = syllabusPlans
    .map((p, i) => `=== Tema ${i + 1}: ${p.name} ===\n${p.plan}`)
    .join('\n\n');

  const user =
    `Tengo estos planes de estudio individuales para la asignatura "${folderName}":\n\n` +
    `${plansText}\n\n` +
    `Crea un plan unificado que:\n` +
    `1. Integre todos los temas de forma coherente y progresiva.\n` +
    `2. Evite solapamientos y distribuya la carga de forma equilibrada.\n` +
    `3. Tenga en cuenta dependencias entre temas (primero los conceptos base).\n` +
    `4. Proponga un orden y ritmo de estudio óptimo para toda la asignatura.\n` +
    `5. Indique cuántas sesiones totales recomienda y de qué duración.\n\n` +
    `Responde en español de forma clara y estructurada.`;

  return callGroq(system, user);
}

export type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
};

export async function generateQuiz(
  studyContent: string,
  topic: string
): Promise<QuizQuestion[]> {
  const system =
    'Eres un profesor que crea tests de evaluación. ' +
    'Respondes ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional.';

  const user =
    `Crea un test de 10 a 15 preguntas sobre el siguiente contenido de "${topic}":\n\n${studyContent}\n\n` +
    `Reglas:\n` +
    `- Cada pregunta tiene entre 2 y 4 opciones de respuesta.\n` +
    `- Solo una opción es correcta.\n` +
    `- Las preguntas deben cubrir los conceptos clave del contenido.\n` +
    `- Varía el nivel: algunas fáciles, otras de comprensión profunda.\n\n` +
    `Responde ÚNICAMENTE con este JSON (sin explicaciones ni markdown):\n` +
    `{"questions":[{"question":"Pregunta aquí","options":["Opción A","Opción B","Opción C"],"correctIndex":0}]}`;

  const raw = await callGroq(system, user);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolvió un JSON válido para el test.');

  let parsed: { questions: QuizQuestion[] };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('Error al procesar el test generado. Intenta de nuevo.');
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('El test generado está vacío. Intenta de nuevo.');
  }

  return parsed.questions;
}

export async function getStudySessionPlan(
  syllabusContent: string,
  syllabusName: string,
  date: string,
  time: string
): Promise<string> {
  const system =
    'Eres un tutor personal de estudio. ' +
    'Creas planes de sesión detallados, prácticos y motivadores en español.';

  const user =
    `Voy a estudiar "${syllabusName}" el ${date}${time ? ` a las ${time}` : ''}.\n\n` +
    `Contenido a estudiar:\n${syllabusContent}\n\n` +
    `Crea un plan detallado para esa sesión:\n` +
    `1. Conceptos clave que debo dominar.\n` +
    `2. Orden recomendado para estudiar el contenido.\n` +
    `3. Distribución del tiempo (ej: 25 min estudio / 5 min descanso).\n` +
    `4. Técnicas específicas para este material.\n` +
    `5. Puntos más difíciles a los que prestar atención.`;

  return callGroq(system, user);
}
