import { useMemo, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  getScheduleRecommendation,
  getDetailedStudyCalendar,
  getMergedFolderPlan,
  generateQuiz,
  CalendarEntry,
  QuizQuestion
} from '../services/gemini';

// ── Calendario en español ──────────────────────────────────────────────────
LocaleConfig.locales['es'] = {
  monthNames: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  monthNamesShort: ['Ene.','Feb.','Mar.','Abr.','May.','Jun.','Jul.','Ago.','Sep.','Oct.','Nov.','Dic.'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Dom.','Lun.','Mar.','Mié.','Jue.','Vie.','Sáb.'],
  today: 'Hoy'
};
LocaleConfig.defaultLocale = 'es';

// ── Tipos ──────────────────────────────────────────────────────────────────
type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

type Folder = {
  id: string;
  name: string;
  examDate: string;  // dd/mm/yyyy
  savedPlan?: string;
  planVisible?: boolean;
};

type UploadedSyllabus = {
  id: string;
  displayName: string;
  content: string;
  folderId?: string;
  savedPlan?: string;
  planVisible?: boolean;
};

type StudyPlan = {
  id: string;
  syllabusId: string;
  topic: string;
  day: string;
  time: string;
  detailedContent?: string;
};

type DayQuiz = {
  day: string;
  questions: QuizQuestion[];
};

type QuizModal = {
  visible: boolean;
  day: string;
  topic: string;
  questions: QuizQuestion[];
  selected: (number | null)[];
  submitted: boolean;
};

type AiPhase =
  | 'loading' | 'result' | 'accept-date'
  | 'calendar-loading' | 'calendar-done'
  | 'redo' | 'reject';

type AiModal = {
  visible: boolean;
  phase: AiPhase;
  text: string;
  error: string;
  targetId: string;       // syllabusId or "folder:{folderId}"
  targetName: string;
  targetContent: string;
  redoInstructions: string;
  examDate: string;
  generatedEntries: CalendarEntry[];
};

const MODAL_INIT: AiModal = {
  visible: false, phase: 'loading', text: '', error: '',
  targetId: '', targetName: '', targetContent: '',
  redoInstructions: '', examDate: '', generatedEntries: []
};

// ── Colores ────────────────────────────────────────────────────────────────
const C = {
  bg: '#F8FAFC', white: '#FFFFFF',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB', blue700: '#1D4ED8',
  violet100: '#EDE9FE', violet500: '#8B5CF6', violet600: '#7C3AED',
  emerald100: '#D1FAE5', emerald600: '#059669',
  amber100: '#FEF3C7', amber600: '#D97706',
  red100: '#FEE2E2', red600: '#DC2626',
  slate100: '#F1F5F9', slate200: '#E2E8F0', slate400: '#94A3B8',
  slate500: '#64748B', slate600: '#475569', slate700: '#334155', slate900: '#0F172A'
};

// ── Componente ─────────────────────────────────────────────────────────────
export function HomeScreen() {
  const navigation = useNavigation<Nav>();

  // Temarios y carpetas
  const [syllabi, setSyllabi] = useState<UploadedSyllabus[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Formulario nuevo temario (siempre dentro de una carpeta)
  const [showSyllabusForm, setShowSyllabusForm] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState('');
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');

  // Formulario nueva carpeta
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderExamDate, setNewFolderExamDate] = useState('');

  // Calendario
  const [calendarTopic, setCalendarTopic] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarTime, setCalendarTime] = useState('');
  const [studyPlan, setStudyPlan] = useState<StudyPlan[]>([]);

  // Quiz
  const [dayQuizzes, setDayQuizzes] = useState<DayQuiz[]>([]);
  const [quizGenerating, setQuizGenerating] = useState(''); // día en generación
  const [quizModal, setQuizModal] = useState<QuizModal | null>(null);

  // Modal IA
  const [modal, setModal] = useState<AiModal>(MODAL_INIT);
  // Modal contenido (temario completo / planificación del día)
  const [contentModal, setContentModal] = useState<{ visible: boolean; title: string; text: string }>({
    visible: false, title: '', text: ''
  });
  const closeContentModal = () => setContentModal({ visible: false, title: '', text: '' });

  // ── Computed ──────────────────────────────────────────────────────────────
  const canSaveSyllabus = newName.trim().length > 0 && newContent.trim().length > 0 && activeFolderId.length > 0;
  const canSaveFolder = newFolderName.trim().length > 0 && newFolderExamDate.trim().length > 0;
  const canAddPlan = calendarTopic.trim() && selectedDate.trim() && calendarTime.trim();

  const plansForDate = useMemo(
    () => studyPlan.filter(e => e.day === selectedDate),
    [studyPlan, selectedDate]
  );

  const totalStudyDays = useMemo(
    () => new Set(studyPlan.map(e => e.day)).size,
    [studyPlan]
  );

  const markedDates = useMemo(() => {
    const map: Record<string, { marked: boolean; selected?: boolean; selectedColor?: string }> = {};
    studyPlan.forEach(e => { map[e.day] = { ...(map[e.day] ?? {}), marked: true }; });
    if (selectedDate) {
      map[selectedDate] = { ...(map[selectedDate] ?? {}), selected: true, selectedColor: C.blue600, marked: true };
    }
    return map;
  }, [studyPlan, selectedDate]);

  // ── Handlers: temarios y carpetas ─────────────────────────────────────────
  const saveSyllabus = () => {
    if (!canSaveSyllabus) return;
    const s: UploadedSyllabus = {
      id: Date.now().toString(),
      displayName: newName.trim(),
      content: newContent.trim(),
      folderId: activeFolderId
    };
    setSyllabi(prev => [s, ...prev]);
    if (!calendarTopic) setCalendarTopic(s.displayName);
    setNewName(''); setNewContent(''); setActiveFolderId('');
    setShowSyllabusForm(false);
  };

  const saveFolder = () => {
    if (!canSaveFolder) return;
    const f: Folder = {
      id: Date.now().toString(),
      name: newFolderName.trim(),
      examDate: newFolderExamDate.trim()
    };
    setFolders(prev => [f, ...prev]);
    setNewFolderName(''); setNewFolderExamDate('');
    setShowFolderForm(false);
  };

  const deleteSyllabus = (id: string) => {
    setSyllabi(prev => {
      const removed = prev.find(s => s.id === id);
      const next = prev.filter(s => s.id !== id);
      if (removed && calendarTopic === removed.displayName) setCalendarTopic(next[0]?.displayName ?? '');
      return next;
    });
  };

  const deleteFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setSyllabi(prev => prev.map(s => s.folderId === id ? { ...s, folderId: undefined } : s));
  };

  const assignFolder = (syllabusId: string, folderId: string) => {
    setSyllabi(prev => prev.map(s => s.id === syllabusId ? { ...s, folderId: folderId || undefined } : s));
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSyllabusPlan = (id: string) =>
    setSyllabi(prev => prev.map(s => s.id === id ? { ...s, planVisible: !s.planVisible } : s));

  const toggleFolderPlan = (id: string) =>
    setFolders(prev => prev.map(f => f.id === id ? { ...f, planVisible: !f.planVisible } : f));

  // ── Handlers: IA ──────────────────────────────────────────────────────────
  const openAi = async (targetId: string, targetName: string, targetContent: string, instructions?: string) => {
    setModal({ ...MODAL_INIT, visible: true, phase: 'loading', targetId, targetName, targetContent });
    try {
      const text = await getScheduleRecommendation(targetContent, targetName, instructions);
      setModal(prev => ({ ...prev, phase: 'result', text }));
    } catch (e: unknown) {
      setModal(prev => ({
        ...prev, phase: 'result', text: '',
        error: e instanceof Error ? e.message : 'Error al contactar con la IA.'
      }));
    }
  };

  const openSyllabusAi = (s: UploadedSyllabus) => openAi(s.id, s.displayName, s.content);

  const openFolderMerge = async (f: Folder) => {
    const folderSyllabi = syllabi.filter(s => s.folderId === f.id && s.savedPlan);
    const plans = folderSyllabi.map(s => ({ name: s.displayName, plan: s.savedPlan! }));
    // Usamos como "content" un resumen ligero para que el modal pueda rehacer si quiere
    const combinedLight = plans.map(p => `=== ${p.name} ===\n${p.plan}`).join('\n\n');
    setModal({ ...MODAL_INIT, visible: true, phase: 'loading', targetId: `folder:${f.id}`, targetName: f.name, targetContent: combinedLight });
    try {
      const text = await getMergedFolderPlan(f.name, plans);
      setModal(prev => ({ ...prev, phase: 'result', text }));
    } catch (e: unknown) {
      setModal(prev => ({ ...prev, phase: 'result', text: '', error: e instanceof Error ? e.message : 'Error al contactar con la IA.' }));
    }
  };

  const handleRedo = () => setModal(prev => ({ ...prev, phase: 'redo', redoInstructions: '' }));
  const handleReject = () => setModal(prev => ({ ...prev, phase: 'reject' }));

  const handleAccept = () => {
    const isFolderMerge = modal.targetId.startsWith('folder:');

    if (!isFolderMerge) {
      // Tema individual → solo guardar plan, sin calendario
      setSyllabi(prev => prev.map(s =>
        s.id === modal.targetId ? { ...s, savedPlan: modal.text, planVisible: false } : s
      ));
      closeModal();
      return;
    }

    // Carpeta → usar fecha de examen de la carpeta directamente
    const folderId = modal.targetId.replace('folder:', '');
    const folder = folders.find(f => f.id === folderId);
    if (!folder?.examDate) {
      setModal(prev => ({ ...prev, phase: 'accept-date', examDate: '', error: '' }));
      return;
    }

    const { targetContent, targetName } = modal;
    const examRaw = folder.examDate.trim();
    const match = examRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      setModal(prev => ({ ...prev, phase: 'result', error: `Fecha del examen en la carpeta no es válida: ${examRaw}` }));
      return;
    }
    const [, d, m, y] = match;
    const examISO = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const todayISO = new Date().toISOString().split('T')[0];

    setModal(prev => ({ ...prev, phase: 'calendar-loading', error: '' }));
    getDetailedStudyCalendar(targetContent, targetName, examISO, todayISO)
      .then(entries => setModal(prev => ({ ...prev, phase: 'calendar-done', generatedEntries: entries })))
      .catch(e => setModal(prev => ({ ...prev, phase: 'result', error: e instanceof Error ? e.message : 'Error generando el calendario.' })));
  };

  const regenerate = () => {
    const { targetId, targetName, targetContent, redoInstructions } = modal;
    openAi(targetId, targetName, targetContent, redoInstructions);
  };

  const generateCalendar = async () => {
    const examRaw = modal.examDate.trim();
    const match = examRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      setModal(prev => ({ ...prev, error: 'Formato incorrecto. Usa dd/mm/yyyy.' }));
      return;
    }
    const [, d, m, y] = match;
    const examISO = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const todayISO = new Date().toISOString().split('T')[0];

    setModal(prev => ({ ...prev, phase: 'calendar-loading', error: '' }));
    try {
      const entries = await getDetailedStudyCalendar(modal.targetContent, modal.targetName, examISO, todayISO);
      setModal(prev => ({ ...prev, phase: 'calendar-done', generatedEntries: entries }));
    } catch (e: unknown) {
      setModal(prev => ({
        ...prev, phase: 'accept-date',
        error: e instanceof Error ? e.message : 'Error generando el calendario.'
      }));
    }
  };

  const confirmCalendar = () => {
    const { targetId, targetName, text, generatedEntries } = modal;

    // Guardar plan en el temario o carpeta
    if (targetId.startsWith('folder:')) {
      const folderId = targetId.replace('folder:', '');
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, savedPlan: text, planVisible: true } : f));
    } else {
      setSyllabi(prev => prev.map(s => s.id === targetId ? { ...s, savedPlan: text, planVisible: true } : s));
    }

    // Añadir entradas al calendario
    const syllabusId = targetId.startsWith('folder:') ? '' : targetId;
    const newEntries: StudyPlan[] = generatedEntries.map(e => ({
      id: `ai-${e.date}-${Date.now()}`,
      syllabusId,
      topic: targetName,
      day: e.date,
      time: '',
      detailedContent: `${e.topic}\n\n${e.content}`
    }));

    setStudyPlan(prev => {
      // Eliminar entradas anteriores del mismo temario en esos días para no duplicar
      const existingDays = new Set(newEntries.map(e => e.day));
      const filtered = prev.filter(p => !(p.topic === targetName && existingDays.has(p.day)));
      return [...newEntries, ...filtered];
    });

    setModal(MODAL_INIT);
  };

  const closeModal = () => setModal(MODAL_INIT);

  // ── Handlers: quiz ────────────────────────────────────────────────────────
  const getDayContent = (day: string) => {
    const entries = studyPlan.filter(e => e.day === day);
    return entries.map(e => {
      const syl = syllabi.find(s => s.id === e.syllabusId);
      return `[${e.topic}]\n${e.detailedContent || syl?.content || e.topic}`;
    }).join('\n\n');
  };

  const getDayTopic = (day: string) =>
    studyPlan.filter(e => e.day === day).map(e => e.topic).join(', ');

  const genQuiz = async (day: string) => {
    const content = getDayContent(day);
    const topic = getDayTopic(day);
    if (!content) return;
    setQuizGenerating(day);
    try {
      const questions = await generateQuiz(content, topic);
      setDayQuizzes(prev => {
        const without = prev.filter(q => q.day !== day);
        return [...without, { day, questions }];
      });
    } catch {
      // silently fail — user can retry
    } finally {
      setQuizGenerating('');
    }
  };

  const openQuiz = (day: string) => {
    const quiz = dayQuizzes.find(q => q.day === day);
    if (!quiz) return;
    setQuizModal({
      visible: true,
      day,
      topic: getDayTopic(day),
      questions: quiz.questions,
      selected: quiz.questions.map(() => null),
      submitted: false
    });
  };

  const selectAnswer = (qIdx: number, optIdx: number) => {
    if (quizModal?.submitted) return;
    setQuizModal(prev => {
      if (!prev) return prev;
      const selected = [...prev.selected];
      selected[qIdx] = optIdx;
      return { ...prev, selected };
    });
  };

  const submitQuiz = () => setQuizModal(prev => prev ? { ...prev, submitted: true } : prev);

  const resetQuiz = () =>
    setQuizModal(prev => prev ? { ...prev, selected: prev.questions.map(() => null), submitted: false } : prev);

  const closeQuiz = () => setQuizModal(null);

  const quizScore = quizModal?.submitted
    ? quizModal.questions.filter((q, i) => quizModal.selected[i] === q.correctIndex).length
    : 0;

  // ── Handlers: calendario manual ──────────────────────────────────────────
  const addStudyPlan = () => {
    if (!canAddPlan) return;
    const syllabus = syllabi.find(s => s.displayName === calendarTopic);
    setStudyPlan(prev => [{
      id: Date.now().toString(),
      syllabusId: syllabus?.id ?? '',
      topic: calendarTopic.trim(),
      day: selectedDate.trim(),
      time: calendarTime.trim()
    }, ...prev]);
    setCalendarTime('');
  };

  const goToStudySession = (entry: StudyPlan) => {
    const syllabus = syllabi.find(s => s.id === entry.syllabusId);
    navigation.navigate('StudySession', {
      syllabusContent: entry.detailedContent || syllabus?.content || '',
      syllabusName: entry.topic,
      date: entry.day,
      time: entry.time
    });
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderSyllabusCard = (item: UploadedSyllabus) => (
    <View key={item.id} style={s.syllabusCard}>
      <View style={s.syllabusLeft}>
        <View style={s.syllabusIconWrap}><Text style={s.syllabusIconText}>📄</Text></View>
        <View style={s.syllabusInfo}>
          <Text style={s.syllabusName}>{item.displayName}</Text>
          <Text style={s.syllabusPreview} numberOfLines={2}>{item.content}</Text>
        </View>
      </View>
      <View style={s.syllabusActions}>
        <Pressable style={s.aiBtn} onPress={() => openSyllabusAi(item)}>
          <Text style={s.aiBtnText}>✦ Planificar con IA</Text>
        </Pressable>
        <View style={s.syllabusActionsRow}>
          <Pressable style={s.viewBtn} onPress={() => setContentModal({ visible: true, title: item.displayName, text: item.content })}>
            <Text style={s.viewBtnText}>📖 Ver temario</Text>
          </Pressable>
          {item.savedPlan ? (
            <Pressable style={s.planToggleBtn} onPress={() => toggleSyllabusPlan(item.id)}>
              <Text style={s.planToggleBtnText}>{item.planVisible ? 'Ocultar plan' : 'Ver plan IA'}</Text>
            </Pressable>
          ) : null}
          <Pressable style={s.dangerBtn} onPress={() => deleteSyllabus(item.id)}>
            <Text style={s.dangerBtnText}>Eliminar</Text>
          </Pressable>
        </View>
        {folders.length > 0 ? (
          <View style={s.folderAssignRow}>
            <Text style={s.folderAssignLabel}>
              {item.folderId ? `📁 ${folders.find(f => f.id === item.folderId)?.name ?? 'Carpeta'}` : '📂 Sin carpeta'}
            </Text>
            <View style={[s.pickerInner, { flex: 1 }]}>
              <Picker
                selectedValue={item.folderId ?? ''}
                onValueChange={v => assignFolder(item.id, String(v))}
              >
                <Picker.Item label="Sin carpeta" value="" />
                {folders.map(f => <Picker.Item key={f.id} label={`📁 ${f.name}`} value={f.id} />)}
              </Picker>
            </View>
          </View>
        ) : null}
      </View>
      {item.savedPlan && item.planVisible ? (
        <View style={s.savedPlanBox}>
          <Text style={s.savedPlanText}>{item.savedPlan}</Text>
        </View>
      ) : null}
    </View>
  );

  // ── Render modal ──────────────────────────────────────────────────────────
  const renderModalContent = () => {
    if (modal.phase === 'loading' || modal.phase === 'calendar-loading') {
      return (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.violet600} />
          <Text style={s.loadingText}>
            {modal.phase === 'loading' ? 'Analizando tu temario...' : 'Generando tu calendario de estudio...'}
          </Text>
        </View>
      );
    }

    if (modal.phase === 'result') {
      return (
        <>
          {modal.error ? (
            <View style={s.errorBox}><Text style={s.errorText}>{modal.error}</Text></View>
          ) : (
            <ScrollView style={s.sheetScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.sheetText}>{modal.text}</Text>
            </ScrollView>
          )}
          <View style={s.actionGrid}>
            <Pressable style={[s.actionBtn, s.actionBtnGreen]} onPress={handleAccept}>
              <Text style={s.actionBtnText}>✓ Aceptar planificación</Text>
            </Pressable>
            <Pressable style={[s.actionBtn, s.actionBtnAmber]} onPress={handleRedo}>
              <Text style={s.actionBtnText}>↺ Rehacer planificación</Text>
            </Pressable>
            <Pressable style={[s.actionBtn, s.actionBtnRed]} onPress={handleReject}>
              <Text style={s.actionBtnText}>✕ Rechazar planificación</Text>
            </Pressable>
          </View>
        </>
      );
    }

    if (modal.phase === 'accept-date') {
      return (
        <>
          <Text style={s.modalSubtitle}>¿Cuándo tienes el examen?</Text>
          <Text style={s.modalHint}>La IA creará un plan día a día desde hoy hasta el examen.</Text>
          <TextInput
            style={s.input}
            placeholder="dd/mm/yyyy  (ej: 20/06/2026)"
            placeholderTextColor={C.slate400}
            value={modal.examDate}
            onChangeText={v => setModal(prev => ({ ...prev, examDate: v, error: '' }))}
            keyboardType="numeric"
          />
          {modal.error ? <View style={s.errorBox}><Text style={s.errorText}>{modal.error}</Text></View> : null}
          <View style={s.actionRow}>
            <Pressable style={[s.actionBtn, s.actionBtnSlate]} onPress={() => setModal(prev => ({ ...prev, phase: 'result' }))}>
              <Text style={s.actionBtnText}>← Volver</Text>
            </Pressable>
            <Pressable
              style={[s.actionBtn, s.actionBtnGreen, !modal.examDate.trim() && s.btnDisabled]}
              onPress={generateCalendar}
              disabled={!modal.examDate.trim()}
            >
              <Text style={s.actionBtnText}>Generar calendario</Text>
            </Pressable>
          </View>
        </>
      );
    }

    if (modal.phase === 'calendar-done') {
      return (
        <>
          <View style={s.calDoneHeader}>
            <Text style={s.calDoneCount}>{modal.generatedEntries.length}</Text>
            <Text style={s.calDoneLabel}>sesiones de estudio generadas</Text>
          </View>
          <ScrollView style={s.sheetScroll} showsVerticalScrollIndicator={false}>
            {modal.generatedEntries.map((e, i) => (
              <View key={i} style={s.calEntry}>
                <Text style={s.calEntryDate}>{e.date}</Text>
                <View style={s.calEntryRight}>
                  <Text style={s.calEntryTopic}>{e.topic}</Text>
                  <Text style={s.calEntryContent} numberOfLines={2}>{e.content}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable style={[s.actionBtn, s.actionBtnGreen]} onPress={confirmCalendar}>
            <Text style={s.actionBtnText}>✓ Añadir al calendario</Text>
          </Pressable>
          <Pressable style={[s.actionBtn, s.actionBtnSlate]} onPress={() => setModal(prev => ({ ...prev, phase: 'accept-date' }))}>
            <Text style={s.actionBtnText}>← Cambiar fecha</Text>
          </Pressable>
        </>
      );
    }

    if (modal.phase === 'redo') {
      return (
        <>
          <Text style={s.modalSubtitle}>¿Cómo quieres modificar la planificación?</Text>
          <TextInput
            style={s.textArea}
            placeholder="Ej: Quiero estudiar máximo 1h al día. Pon más énfasis en los temas de matemáticas..."
            placeholderTextColor={C.slate400}
            value={modal.redoInstructions}
            onChangeText={v => setModal(prev => ({ ...prev, redoInstructions: v }))}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <View style={s.actionRow}>
            <Pressable style={[s.actionBtn, s.actionBtnSlate]} onPress={() => setModal(prev => ({ ...prev, phase: 'result' }))}>
              <Text style={s.actionBtnText}>Cancelar</Text>
            </Pressable>
            <Pressable style={[s.actionBtn, s.actionBtnAmber]} onPress={regenerate}>
              <Text style={s.actionBtnText}>↺ Regenerar</Text>
            </Pressable>
          </View>
        </>
      );
    }

    if (modal.phase === 'reject') {
      return (
        <>
          <Text style={s.modalSubtitle}>¿Qué quieres hacer?</Text>
          <Pressable style={[s.actionBtn, s.actionBtnAmber]} onPress={regenerate}>
            <Text style={s.actionBtnText}>↺ Repetir generación</Text>
          </Pressable>
          <Pressable style={[s.actionBtn, s.actionBtnSlate]} onPress={closeModal}>
            <Text style={s.actionBtnText}>Salir</Text>
          </Pressable>
        </>
      );
    }

    return null;
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      {/* Modal ver contenido completo */}
      <Modal visible={contentModal.visible} animationType="slide" transparent onRequestClose={closeContentModal}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { flex: 1 }]} numberOfLines={1}>{contentModal.title}</Text>
              <Pressable onPress={closeContentModal} hitSlop={12}><Text style={s.closeX}>✕</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={s.sheetScroll}>
              <Text style={s.sheetText}>{contentModal.text}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modal.visible} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View style={s.sheetTitleRow}>
                <View style={s.aiDot} />
                <Text style={s.sheetTitle} numberOfLines={1}>{modal.targetName}</Text>
              </View>
              {modal.phase !== 'loading' && modal.phase !== 'calendar-loading' ? (
                <Pressable onPress={closeModal} hitSlop={12}><Text style={s.closeX}>✕</Text></Pressable>
              ) : null}
            </View>
            {renderModalContent()}
          </View>
        </View>
      </Modal>

      {/* Modal quiz */}
      <Modal visible={!!quizModal?.visible} animationType="slide" transparent onRequestClose={closeQuiz}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: '95%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>Test de conocimiento</Text>
                {quizModal?.topic ? <Text style={{ fontSize: 12, color: C.slate500, marginTop: 2 }}>{quizModal.topic}</Text> : null}
              </View>
              <Pressable onPress={closeQuiz} hitSlop={12}><Text style={s.closeX}>✕</Text></Pressable>
            </View>

            {quizModal?.submitted ? (
              <View style={s.quizScoreBox}>
                <Text style={s.quizScoreNum}>{quizScore}/{quizModal.questions.length}</Text>
                <Text style={s.quizScoreLabel}>
                  {quizScore === quizModal.questions.length ? '¡Perfecto! 🎉' :
                   quizScore >= quizModal.questions.length * 0.7 ? '¡Muy bien! 👍' :
                   quizScore >= quizModal.questions.length * 0.5 ? 'Puedes mejorar 📚' : 'Repasa el temario 💪'}
                </Text>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {quizModal?.questions.map((q, qi) => {
                const chosen = quizModal.selected[qi];
                return (
                  <View key={qi} style={s.quizQuestion}>
                    <Text style={s.quizQuestionText}>{qi + 1}. {q.question}</Text>
                    {q.options.map((opt, oi) => {
                      const isChosen = chosen === oi;
                      const isCorrect = q.correctIndex === oi;
                      let bg = C.white;
                      let border = C.slate200;
                      let textC = C.slate900;
                      if (quizModal.submitted) {
                        if (isCorrect) { bg = '#DCFCE7'; border = '#16A34A'; textC = '#14532D'; }
                        else if (isChosen && !isCorrect) { bg = C.red100; border = C.red600; textC = C.red600; }
                      } else if (isChosen) {
                        bg = C.violet100; border = C.violet600; textC = C.violet600;
                      }
                      return (
                        <Pressable
                          key={oi}
                          style={[s.quizOption, { backgroundColor: bg, borderColor: border }]}
                          onPress={() => selectAnswer(qi, oi)}
                          disabled={quizModal.submitted}
                        >
                          <Text style={[s.quizOptionText, { color: textC }]}>
                            {quizModal.submitted && isCorrect ? '✓ ' : quizModal.submitted && isChosen && !isCorrect ? '✗ ' : ''}
                            {opt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
              <View style={{ height: 16 }} />
            </ScrollView>

            {quizModal?.submitted ? (
              <View style={s.actionRow}>
                <Pressable style={[s.actionBtn, s.actionBtnSlate]} onPress={closeQuiz}>
                  <Text style={s.actionBtnText}>Cerrar</Text>
                </Pressable>
                <Pressable style={[s.actionBtn, { backgroundColor: C.violet600, flex: 1 }]} onPress={resetQuiz}>
                  <Text style={s.actionBtnText}>🔄 Repetir test</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[s.primaryBtn, quizModal?.selected.some(a => a !== null) ? {} : s.btnDisabled]}
                onPress={submitQuiz}
                disabled={!quizModal?.selected.some(a => a !== null)}
              >
                <Text style={s.primaryBtnText}>Enviar respuestas</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>PANEL DE ESTUDIO</Text>
              <Text style={s.heroTitle}>Habitos{'\n'}Estudio</Text>
            </View>
            <View style={s.heroStats}>
              <View style={s.statPill}>
                <Text style={s.statNum}>{syllabi.length}</Text>
                <Text style={s.statLbl}>temarios</Text>
              </View>
              <View style={s.statPill}>
                <Text style={s.statNum}>{totalStudyDays}</Text>
                <Text style={s.statLbl}>días plan.</Text>
              </View>
            </View>
          </View>
          <Text style={s.heroSub}>Gestiona tu aprendizaje con inteligencia artificial</Text>
        </View>

        {/* Mis Temarios */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Mis Temarios</Text>
            {syllabi.length > 0 && (
              <View style={s.countBadge}><Text style={s.countBadgeText}>{syllabi.length}</Text></View>
            )}
          </View>

          {/* Botón nueva carpeta */}
          {!showFolderForm && !showSyllabusForm ? (
            <Pressable style={s.folderBtn} onPress={() => setShowFolderForm(true)}>
              <Text style={s.folderBtnIcon}>📁</Text>
              <Text style={s.folderBtnText}>Nueva asignatura / carpeta</Text>
            </Pressable>
          ) : null}

          {/* Formulario nueva carpeta */}
          {showFolderForm ? (
            <View style={s.fileForm}>
              <Text style={s.inputLabel}>Nombre de la asignatura</Text>
              <TextInput style={s.input} placeholder="Ej: Biología, Historia, Matemáticas..." placeholderTextColor={C.slate400} value={newFolderName} onChangeText={setNewFolderName} />
              <Text style={s.inputLabel}>Fecha del examen</Text>
              <Text style={s.inputHint}>Todos los temarios de esta carpeta se planificarán hacia esta fecha</Text>
              <TextInput style={s.input} placeholder="dd/mm/yyyy  (ej: 20/06/2026)" placeholderTextColor={C.slate400} value={newFolderExamDate} onChangeText={setNewFolderExamDate} keyboardType="numeric" />
              <View style={s.formRow}>
                <Pressable style={s.cancelBtn} onPress={() => { setShowFolderForm(false); setNewFolderName(''); setNewFolderExamDate(''); }}>
                  <Text style={s.cancelBtnText}>Cancelar</Text>
                </Pressable>
                <Pressable style={[s.saveBtn, !canSaveFolder && s.btnDisabled]} onPress={saveFolder} disabled={!canSaveFolder}>
                  <Text style={s.saveBtnText}>Crear carpeta</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Formulario nuevo temario (siempre desde una carpeta) */}
          {showSyllabusForm ? (
            <View style={s.fileForm}>
              <View style={s.folderTagRow}>
                <Text style={s.folderTagIcon}>📁</Text>
                <Text style={s.folderTagText}>{folders.find(f => f.id === activeFolderId)?.name ?? ''}</Text>
              </View>
              <Text style={s.inputLabel}>Nombre del temario</Text>
              <TextInput style={s.input} placeholder="Ej: Tema 3 – Historia Medieval" placeholderTextColor={C.slate400} value={newName} onChangeText={setNewName} />
              <Text style={s.inputLabel}>Contenido del temario</Text>
              <Text style={s.inputHint}>Pega o escribe aquí los temas, índice o apuntes</Text>
              <TextInput style={s.textArea} placeholder="Ej: Tema 1: La Edad Media. Feudalismo y estructura social..." placeholderTextColor={C.slate400} value={newContent} onChangeText={setNewContent} multiline numberOfLines={5} textAlignVertical="top" />
              <View style={s.formRow}>
                <Pressable style={s.cancelBtn} onPress={() => { setShowSyllabusForm(false); setNewName(''); setNewContent(''); setActiveFolderId(''); }}>
                  <Text style={s.cancelBtnText}>Cancelar</Text>
                </Pressable>
                <Pressable style={[s.saveBtn, !canSaveSyllabus && s.btnDisabled]} onPress={saveSyllabus} disabled={!canSaveSyllabus}>
                  <Text style={s.saveBtnText}>Guardar</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {folders.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>📁</Text>
              <Text style={s.emptyText}>Crea una carpeta de asignatura para empezar a añadir temarios</Text>
            </View>
          ) : null}

          {/* Carpetas */}
          {folders.map(folder => {
            const folderSyllabi = syllabi.filter(s => s.folderId === folder.id);
            const isOpen = expandedFolders.has(folder.id);
            return (
              <View key={folder.id} style={s.folderCard}>
                <Pressable style={s.folderCardHeader} onPress={() => toggleFolder(folder.id)}>
                  <Text style={s.folderIcon}>📁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.folderName}>{folder.name}</Text>
                    <Text style={{ fontSize: 11, color: C.amber600, fontWeight: '600', marginTop: 2 }}>
                      🗓 Examen: {folder.examDate} · {folderSyllabi.length} tema{folderSyllabi.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={s.folderChevron}>{isOpen ? '▲' : '▼'}</Text>
                </Pressable>
                <View style={s.folderActions}>
                  <Pressable style={s.addTopicBtn} onPress={() => { setActiveFolderId(folder.id); setShowSyllabusForm(true); setShowFolderForm(false); }}>
                    <Text style={s.addTopicBtnText}>+ Añadir tema</Text>
                  </Pressable>
                  {syllabi.filter(syl => syl.folderId === folder.id && syl.savedPlan).length >= 2 ? (
                    <Pressable style={s.mergeBtn} onPress={() => openFolderMerge(folder)}>
                      <Text style={s.mergeBtnText}>🔗 Unir planificaciones → calendario</Text>
                    </Pressable>
                  ) : (
                    <Text style={{ fontSize: 12, color: C.slate400, textAlign: 'center' }}>
                      Planifica al menos 2 temas individualmente para poder unirlos
                    </Text>
                  )}
                  <View style={s.syllabusActionsRow}>
                    {folder.savedPlan ? (
                      <Pressable style={s.planToggleBtn} onPress={() => toggleFolderPlan(folder.id)}>
                        <Text style={s.planToggleBtnText}>{folder.planVisible ? 'Ocultar plan' : 'Ver plan unificado'}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={s.dangerBtn} onPress={() => deleteFolder(folder.id)}>
                      <Text style={s.dangerBtnText}>Eliminar carpeta</Text>
                    </Pressable>
                  </View>
                </View>
                {folder.savedPlan && folder.planVisible ? (
                  <View style={s.savedPlanBox}><Text style={s.savedPlanText}>{folder.savedPlan}</Text></View>
                ) : null}
                {isOpen ? (
                  <View style={s.folderSyllabi}>
                    {folderSyllabi.length === 0 ? (
                      <View style={s.emptyState}>
                        <Text style={s.emptyIcon}>📄</Text>
                        <Text style={s.emptyText}>Pulsa "+ Añadir tema" para añadir temarios a esta carpeta</Text>
                      </View>
                    ) : (
                      folderSyllabi.map(renderSyllabusCard)
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}

          {syllabi.length === 0 && folders.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>📚</Text>
              <Text style={s.emptyText}>Añade temarios o crea carpetas por asignatura</Text>
            </View>
          ) : null}
        </View>

        {/* Calendario */}
        <View style={s.card}>
          <View style={s.cardHeader}><Text style={s.cardTitle}>Calendario</Text></View>

          <View>
            <Text style={s.inputLabel}>Temario a planificar</Text>
            <View style={s.pickerInner}>
              <Picker selectedValue={calendarTopic} onValueChange={v => setCalendarTopic(String(v))}>
                <Picker.Item label="Selecciona un temario..." value="" />
                {syllabi.map(item => <Picker.Item key={item.id} label={item.displayName} value={item.displayName} />)}
              </Picker>
            </View>
          </View>

          <Calendar
            onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            firstDay={1}
            style={s.calendar}
            theme={{
              backgroundColor: C.white, calendarBackground: C.white,
              todayTextColor: C.blue600,
              selectedDayBackgroundColor: C.blue600, selectedDayTextColor: C.white,
              arrowColor: C.blue600, dotColor: C.blue600,
              textDayFontWeight: '500', textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600', textDayFontSize: 14, textMonthFontSize: 16
            }}
          />

          {selectedDate
            ? <View style={s.dateBadge}><Text style={s.dateBadgeText}>📅 {selectedDate}</Text></View>
            : <View style={s.dateBadgeEmpty}><Text style={s.dateBadgeEmptyText}>Selecciona un día en el calendario</Text></View>
          }

          {/* Sesiones del día */}
          {!selectedDate ? (
            <View style={s.emptyState}><Text style={s.emptyIcon}>📆</Text><Text style={s.emptyText}>Selecciona un día para ver la agenda</Text></View>
          ) : plansForDate.length === 0 ? (
            <View style={s.emptyState}><Text style={s.emptyIcon}>✏️</Text><Text style={s.emptyText}>No hay sesiones para este día</Text></View>
          ) : (
            <>
              {plansForDate.map(entry => (
                <View key={entry.id} style={s.planCard}>
                  <View style={s.planTop}>
                    <View style={s.planInfo}>
                      <Text style={s.planTopic}>{entry.topic}</Text>
                      {entry.detailedContent ? (
                        <Text style={s.planDetail} numberOfLines={2}>{entry.detailedContent}</Text>
                      ) : null}
                    </View>
                    {entry.time ? <View style={s.timeBadge}><Text style={s.timeBadgeText}>{entry.time}</Text></View> : null}
                  </View>
                  {entry.detailedContent ? (
                    <Pressable
                      style={s.viewPlanBtn}
                      onPress={() => setContentModal({ visible: true, title: `${entry.topic} — ${entry.day}`, text: entry.detailedContent! })}
                    >
                      <Text style={s.viewPlanBtnText}>📖 Ver planificación del día</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={s.studyAiBtn} onPress={() => goToStudySession(entry)}>
                    <Text style={s.studyAiBtnText}>✦ Estudiar con IA</Text>
                  </Pressable>
                </View>
              ))}

              {/* Sección quiz */}
              {(() => {
                const quiz = dayQuizzes.find(q => q.day === selectedDate);
                const isGenerating = quizGenerating === selectedDate;
                return (
                  <View style={s.quizPromptCard}>
                    {quiz ? (
                      <>
                        <Text style={s.quizPromptTitle}>✅ Test disponible para este día</Text>
                        <View style={s.quizBtnRow}>
                          <Pressable style={[s.quizActionBtn, { backgroundColor: C.violet600 }]} onPress={() => openQuiz(selectedDate)}>
                            <Text style={s.quizActionBtnText}>📝 Realizar test</Text>
                          </Pressable>
                          <Pressable style={[s.quizActionBtn, { backgroundColor: C.slate500 }]} onPress={() => genQuiz(selectedDate)}>
                            <Text style={s.quizActionBtnText}>🔄 Regenerar</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={s.quizPromptTitle}>¿Ya has terminado de estudiar?</Text>
                        <Text style={s.quizPromptSub}>¡Vamos a comprobar cuánto has aprendido!</Text>
                        {isGenerating ? (
                          <View style={s.quizLoadingRow}>
                            <ActivityIndicator color={C.violet600} />
                            <Text style={s.quizLoadingText}>Generando tu test...</Text>
                          </View>
                        ) : (
                          <Pressable style={s.quizCheckBtn} onPress={() => genQuiz(selectedDate)}>
                            <Text style={s.quizCheckBtnText}>🎯 COMPROBAR</Text>
                          </Pressable>
                        )}
                      </>
                    )}
                  </View>
                );
              })()}
            </>
          )}

          <View style={s.divider} />

          {/* Añadir sesión manual — al fondo */}
          <View>
            <Text style={s.inputLabel}>Hora de la sesión</Text>
            <TextInput style={s.input} placeholder="ej: 18:30" placeholderTextColor={C.slate400} value={calendarTime} onChangeText={setCalendarTime} />
          </View>

          <Pressable style={[s.primaryBtn, !canAddPlan && s.btnDisabled]} onPress={addStudyPlan} disabled={!canAddPlan}>
            <Text style={s.primaryBtnText}>Añadir al calendario</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 48, gap: 16 },

  hero: { backgroundColor: C.blue600, borderRadius: 24, padding: 24, gap: 14, shadowColor: C.blue700, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { color: C.blue100, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  heroTitle: { color: C.white, fontSize: 30, fontWeight: '800', lineHeight: 34 },
  heroSub: { color: C.blue100, fontSize: 13, lineHeight: 18 },
  heroStats: { gap: 8, alignItems: 'flex-end' },
  statPill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', minWidth: 72 },
  statNum: { color: C.white, fontSize: 22, fontWeight: '800' },
  statLbl: { color: C.blue100, fontSize: 11, fontWeight: '600' },

  card: { backgroundColor: C.white, borderRadius: 20, padding: 20, gap: 14, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.slate900 },
  countBadge: { backgroundColor: C.blue100, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countBadgeText: { color: C.blue700, fontSize: 13, fontWeight: '700' },

  addRow: { flexDirection: 'row', gap: 10 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: C.blue600, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 12, backgroundColor: C.blue50 },
  uploadBtnIcon: { fontSize: 18, color: C.blue600 },
  uploadBtnText: { color: C.blue600, fontWeight: '700', fontSize: 14 },
  folderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: C.amber600, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 12, backgroundColor: C.amber100 },
  folderBtnIcon: { fontSize: 18 },
  folderBtnText: { color: C.amber600, fontWeight: '700', fontSize: 14 },

  fileForm: { backgroundColor: C.slate100, borderRadius: 14, padding: 14, gap: 10 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: C.slate600 },
  inputHint: { fontSize: 12, color: C.slate400, marginTop: -6 },
  input: { borderWidth: 1.5, borderColor: C.slate200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.slate900, backgroundColor: C.white },
  textArea: { borderWidth: 1.5, borderColor: C.slate200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.slate900, backgroundColor: C.white, minHeight: 110 },
  pickerInner: { borderWidth: 1.5, borderColor: C.slate200, borderRadius: 12, overflow: 'hidden', backgroundColor: C.white },
  formRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: C.slate200, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: C.slate600, fontWeight: '600', fontSize: 14 },
  saveBtn: { flex: 1, backgroundColor: C.blue600, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.45 },

  syllabusCard: { borderWidth: 1, borderColor: C.slate200, borderRadius: 14, padding: 14, gap: 10 },
  syllabusLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  syllabusIconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  syllabusIconText: { fontSize: 18 },
  syllabusInfo: { flex: 1, gap: 4 },
  syllabusName: { fontSize: 15, color: C.slate900, fontWeight: '600' },
  syllabusPreview: { fontSize: 12, color: C.slate400, lineHeight: 16 },
  syllabusActions: { gap: 8 },
  syllabusActionsRow: { flexDirection: 'row', gap: 8 },
  aiBtn: { backgroundColor: C.violet100, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  aiBtnText: { color: C.violet600, fontWeight: '700', fontSize: 13 },
  viewBtn: { flex: 1, backgroundColor: C.slate100, borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  viewBtnText: { color: C.slate600, fontWeight: '600', fontSize: 12 },
  planToggleBtn: { flex: 1, backgroundColor: C.blue50, borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  planToggleBtnText: { color: C.blue600, fontWeight: '600', fontSize: 12 },
  dangerBtn: { flex: 1, backgroundColor: C.red100, borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  dangerBtnText: { color: C.red600, fontWeight: '600', fontSize: 13 },
  folderAssignRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderAssignLabel: { fontSize: 12, color: C.slate500, fontWeight: '600', flexShrink: 0 },
  savedPlanBox: { backgroundColor: C.slate100, borderRadius: 10, padding: 12 },
  savedPlanText: { fontSize: 13, color: C.slate700, lineHeight: 20 },

  folderCard: { borderWidth: 1.5, borderColor: C.amber600, borderRadius: 14, overflow: 'hidden' },
  folderCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: C.amber100 },
  folderIcon: { fontSize: 20 },
  folderName: { flex: 1, fontSize: 15, fontWeight: '700', color: C.slate900 },
  folderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderCount: { fontSize: 12, color: C.slate500 },
  folderChevron: { fontSize: 12, color: C.slate500 },
  folderExamBadge: { backgroundColor: C.amber600, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  folderExamText: { color: C.white, fontSize: 11, fontWeight: '700' },
  folderActions: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10, gap: 8 },
  addTopicBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: C.blue600, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10, backgroundColor: C.blue50 },
  addTopicBtnText: { color: C.blue600, fontWeight: '700', fontSize: 13 },
  mergeBtn: { backgroundColor: '#D1FAE5', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  mergeBtnText: { color: '#065F46', fontWeight: '700', fontSize: 13 },
  folderSyllabi: { paddingHorizontal: 14, paddingBottom: 14, gap: 10, borderTopWidth: 1, borderTopColor: C.slate200 },
  folderTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.amber100, borderRadius: 8, padding: 8 },
  folderTagIcon: { fontSize: 16 },
  folderTagText: { fontSize: 13, fontWeight: '700', color: C.amber600 },

  emptyState: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: 14, color: C.slate400, textAlign: 'center' },

  calendar: { borderRadius: 12, overflow: 'hidden' },
  dateBadge: { backgroundColor: C.blue50, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  dateBadgeText: { color: C.blue700, fontWeight: '600', fontSize: 13 },
  dateBadgeEmpty: { backgroundColor: C.slate100, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  dateBadgeEmptyText: { color: C.slate400, fontSize: 13 },
  divider: { height: 1, backgroundColor: C.slate200 },
  primaryBtn: { backgroundColor: C.blue600, borderRadius: 14, paddingVertical: 14, alignItems: 'center', shadowColor: C.blue700, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: C.white, fontWeight: '700', fontSize: 15 },

  planCard: { borderWidth: 1, borderColor: C.slate200, borderRadius: 14, padding: 14, gap: 10 },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  planInfo: { flex: 1 },
  planTopic: { fontSize: 15, fontWeight: '600', color: C.slate900 },
  planDetail: { fontSize: 12, color: C.slate500, marginTop: 4, lineHeight: 16 },
  timeBadge: { backgroundColor: C.emerald100, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  timeBadgeText: { color: C.emerald600, fontWeight: '700', fontSize: 13 },
  viewPlanBtn: { backgroundColor: C.blue50, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  viewPlanBtnText: { color: C.blue700, fontWeight: '600', fontSize: 13 },
  studyAiBtn: { backgroundColor: C.violet600, borderRadius: 12, paddingVertical: 10, alignItems: 'center', shadowColor: C.violet600, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  studyAiBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingTop: 12, maxHeight: '90%', gap: 14 },
  sheetHandle: { width: 40, height: 4, backgroundColor: C.slate200, borderRadius: 99, alignSelf: 'center', marginBottom: 6 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  aiDot: { width: 10, height: 10, borderRadius: 99, backgroundColor: C.violet600, flexShrink: 0 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.slate900, flex: 1 },
  closeX: { fontSize: 18, color: C.slate400, paddingHorizontal: 4 },
  sheetScroll: { maxHeight: 260 },
  sheetText: { fontSize: 14, color: '#334155', lineHeight: 22, paddingBottom: 8 },
  modalSubtitle: { fontSize: 15, fontWeight: '600', color: C.slate900 },
  modalHint: { fontSize: 13, color: C.slate500, lineHeight: 18, marginTop: -6 },

  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { fontSize: 14, color: C.slate400, fontStyle: 'italic' },
  errorBox: { backgroundColor: C.red100, borderRadius: 12, padding: 12 },
  errorText: { color: C.red600, fontSize: 13, lineHeight: 20 },

  actionGrid: { gap: 10 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', flex: 1 },
  actionBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
  actionBtnGreen: { backgroundColor: '#16A34A' },
  actionBtnAmber: { backgroundColor: C.amber600 },
  actionBtnRed: { backgroundColor: C.red600 },
  actionBtnSlate: { backgroundColor: C.slate500 },

  calDoneHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  calDoneCount: { fontSize: 32, fontWeight: '800', color: C.violet600 },
  calDoneLabel: { fontSize: 14, color: C.slate600 },
  calEntry: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.slate200 },
  calEntryDate: { fontSize: 13, fontWeight: '700', color: C.blue600, width: 80 },
  calEntryRight: { flex: 1 },
  calEntryTopic: { fontSize: 14, fontWeight: '600', color: C.slate900 },
  calEntryContent: { fontSize: 12, color: C.slate500, marginTop: 2, lineHeight: 16 },

  // ── Quiz ──
  quizPromptCard: { backgroundColor: '#F5F3FF', borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: C.violet100 },
  quizPromptTitle: { fontSize: 15, fontWeight: '700', color: C.slate900 },
  quizPromptSub: { fontSize: 13, color: C.slate500 },
  quizCheckBtn: { backgroundColor: C.violet600, borderRadius: 12, paddingVertical: 13, alignItems: 'center', shadowColor: C.violet600, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  quizCheckBtnText: { color: C.white, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  quizLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 6 },
  quizLoadingText: { fontSize: 13, color: C.slate500, fontStyle: 'italic' },
  quizBtnRow: { flexDirection: 'row', gap: 10 },
  quizActionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  quizActionBtnText: { color: C.white, fontWeight: '700', fontSize: 13 },

  quizScoreBox: { backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16, alignItems: 'center', gap: 4, marginBottom: 4 },
  quizScoreNum: { fontSize: 40, fontWeight: '800', color: '#16A34A' },
  quizScoreLabel: { fontSize: 15, fontWeight: '600', color: C.slate700 },

  quizQuestion: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.slate200, gap: 8 },
  quizQuestionText: { fontSize: 15, fontWeight: '600', color: C.slate900, lineHeight: 20 },
  quizOption: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  quizOptionText: { fontSize: 14, lineHeight: 18 },
});
