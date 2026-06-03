import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getStudySessionPlan } from '../services/gemini';

type Props = NativeStackScreenProps<RootStackParamList, 'StudySession'>;

const C = {
  bg: '#F8FAFC',
  white: '#FFFFFF',
  blue100: '#DBEAFE',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  violet100: '#EDE9FE',
  violet500: '#8B5CF6',
  violet600: '#7C3AED',
  red100: '#FEE2E2',
  red600: '#DC2626',
  slate200: '#E2E8F0',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate700: '#334155',
  slate900: '#0F172A'
};

export function StudySessionScreen({ route, navigation }: Props) {
  const { syllabusContent, syllabusName, date, time } = route.params;

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('');
  const [error, setError] = useState('');

  const generatePlan = async () => {
    if (!syllabusContent) {
      setError('No hay contenido del temario para analizar.');
      return;
    }
    setLoading(true);
    setError('');
    setPlan('');
    try {
      const result = await getStudySessionPlan(syllabusContent, syllabusName, date, time);
      setPlan(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al contactar con la IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={s.backText}>← Volver</Text>
          </Pressable>
          <Text style={s.headerLabel}>SESIÓN DE ESTUDIO</Text>
          <Text style={s.headerTitle}>{syllabusName}</Text>
          <View style={s.metaRow}>
            <View style={s.metaBadge}><Text style={s.metaText}>📅 {date}</Text></View>
            <View style={s.metaBadge}><Text style={s.metaText}>🕐 {time}</Text></View>
          </View>
        </View>

        {/* Generar con IA */}
        <View style={s.card}>
          <View style={s.aiCardHeader}>
            <View style={s.aiIconWrap}>
              <Text style={s.aiIcon}>✦</Text>
            </View>
            <View style={s.aiCardText}>
              <Text style={s.aiCardTitle}>Plan de estudio con IA</Text>
              <Text style={s.aiCardSub}>
                La IA analizará tu temario y creará un plan personalizado para esta sesión.
              </Text>
            </View>
          </View>

          <Pressable
            style={[s.generateBtn, loading && s.btnDisabled]}
            onPress={generatePlan}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={C.white} />
              : <Text style={s.generateBtnText}>Generar plan de estudio</Text>
            }
          </Pressable>

          {loading && (
            <Text style={s.loadingText}>Analizando tu temario... puede tardar unos segundos.</Text>
          )}

          {error ? (
            <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
          ) : null}
        </View>

        {/* Resultado */}
        {plan ? (
          <View style={s.planCard}>
            <View style={s.planCardHeader}>
              <View style={s.planDot} />
              <Text style={s.planCardTitle}>Tu plan de estudio</Text>
            </View>
            <View style={s.planDivider} />
            <Text style={s.planText}>{plan}</Text>
          </View>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 48, gap: 16 },

  header: { backgroundColor: C.blue600, borderRadius: 24, padding: 24, gap: 12, shadowColor: C.blue700, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  backBtn: { alignSelf: 'flex-start' },
  backText: { color: C.blue100, fontSize: 14, fontWeight: '600' },
  headerLabel: { color: C.blue100, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  headerTitle: { color: C.white, fontSize: 26, fontWeight: '800', lineHeight: 30 },
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaBadge: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  metaText: { color: C.white, fontSize: 13, fontWeight: '600' },

  card: { backgroundColor: C.white, borderRadius: 20, padding: 20, gap: 14, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 },
  aiCardHeader: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  aiIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.violet100, alignItems: 'center', justifyContent: 'center' },
  aiIcon: { fontSize: 20, color: C.violet600 },
  aiCardText: { flex: 1, gap: 4 },
  aiCardTitle: { fontSize: 16, fontWeight: '700', color: C.slate900 },
  aiCardSub: { fontSize: 13, color: C.slate500, lineHeight: 18 },

  generateBtn: { backgroundColor: C.violet600, borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: C.violet600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  generateBtnText: { color: C.white, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  loadingText: { fontSize: 13, color: C.slate400, textAlign: 'center', fontStyle: 'italic' },
  errorBox: { backgroundColor: C.red100, borderRadius: 12, padding: 14 },
  errorText: { color: C.red600, fontSize: 13, lineHeight: 20 },

  planCard: { backgroundColor: C.white, borderRadius: 20, padding: 20, gap: 14, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planDot: { width: 10, height: 10, borderRadius: 99, backgroundColor: C.violet500 },
  planCardTitle: { fontSize: 18, fontWeight: '700', color: C.slate900 },
  planDivider: { height: 1, backgroundColor: C.slate200 },
  planText: { fontSize: 14, color: C.slate700, lineHeight: 23 }
});
