import { useMemo, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import { Calendar } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type UploadedSyllabus = {
  id: string;
  displayName: string;
  fileName: string;
  uri: string;
  mimeType: string;
};

type StudyPlan = {
  id: string;
  topic: string;
  day: string;
  time: string;
};

export function HomeScreen() {
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [syllabusName, setSyllabusName] = useState('');
  const [uploadedSyllabi, setUploadedSyllabi] = useState<UploadedSyllabus[]>([]);

  const [calendarTopic, setCalendarTopic] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarTime, setCalendarTime] = useState('');
  const [studyPlan, setStudyPlan] = useState<StudyPlan[]>([]);

  const canSaveSyllabus = useMemo(
    () => selectedFile !== null && syllabusName.trim().length > 0,
    [selectedFile, syllabusName]
  );

  const canAddPlan = useMemo(
    () =>
      calendarTopic.trim().length > 0 &&
      selectedDate.trim().length > 0 &&
      calendarTime.trim().length > 0,
    [calendarTopic, selectedDate, calendarTime]
  );

  const plansForSelectedDate = useMemo(
    () => studyPlan.filter((entry) => entry.day === selectedDate),
    [studyPlan, selectedDate]
  );

  const markedDates = useMemo(() => {
    const map: Record<string, { marked: boolean; selected?: boolean; selectedColor?: string }> = {};

    studyPlan.forEach((entry) => {
      map[entry.day] = {
        ...(map[entry.day] ?? {}),
        marked: true
      };
    });

    if (selectedDate) {
      map[selectedDate] = {
        ...(map[selectedDate] ?? {}),
        selected: true,
        selectedColor: '#1f2a44',
        marked: true
      };
    }

    return map;
  }, [studyPlan, selectedDate]);

  const pickSyllabusFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
      multiple: false
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    setSelectedFile(asset);
    setSyllabusName('');
  };

  const saveSyllabus = () => {
    if (!selectedFile || !syllabusName.trim()) {
      return;
    }

    const nextSyllabus: UploadedSyllabus = {
      id: Date.now().toString(),
      displayName: syllabusName.trim(),
      fileName: selectedFile.name,
      uri: selectedFile.uri,
      mimeType: selectedFile.mimeType ?? 'archivo'
    };

    setUploadedSyllabi((prev) => [nextSyllabus, ...prev]);
    setCalendarTopic((prev) => (prev ? prev : nextSyllabus.displayName));
    setSelectedFile(null);
    setSyllabusName('');
  };

  const openSyllabus = async (uri: string) => {
    try {
      await Linking.openURL(uri);
    } catch {
      return;
    }
  };

  const deleteSyllabus = (id: string) => {
    setUploadedSyllabi((prev) => {
      const removed = prev.find((item) => item.id === id);
      const next = prev.filter((item) => item.id !== id);
      if (removed && calendarTopic === removed.displayName) {
        setCalendarTopic(next.length > 0 ? next[0].displayName : '');
      }
      return next;
    });
  };

  const addStudyPlan = () => {
    if (!canAddPlan) {
      return;
    }

    const nextPlan: StudyPlan = {
      id: Date.now().toString(),
      topic: calendarTopic.trim(),
      day: selectedDate.trim(),
      time: calendarTime.trim()
    };

    setStudyPlan((prev) => [nextPlan, ...prev]);
    setCalendarTime('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Panel de estudio</Text>
          <Text style={styles.subtitle}>Gestión de estudio y planificación</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Añadir Temario</Text>

          <Pressable style={styles.primaryButton} onPress={pickSyllabusFile}>
            <Text style={styles.primaryButtonText}>Subir PDF, DOCX o Excel</Text>
          </Pressable>

          {selectedFile ? (
            <View style={styles.inlineBlock}>
              <Text style={styles.selectedFileText}>{selectedFile.name}</Text>
              <TextInput
                style={styles.input}
                placeholder="Añade nombre al temario"
                placeholderTextColor="#64748b"
                value={syllabusName}
                onChangeText={setSyllabusName}
              />
              <Pressable
                style={[styles.secondaryButton, !canSaveSyllabus && styles.disabledButton]}
                onPress={saveSyllabus}
                disabled={!canSaveSyllabus}
              >
                <Text style={styles.secondaryButtonText}>Guardar temario</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.listContainer}>
            {uploadedSyllabi.length === 0 ? (
              <Text style={styles.emptyText}>No hay temarios cargados</Text>
            ) : (
              uploadedSyllabi.map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{item.displayName}</Text>
                    <Text style={styles.itemMeta}>{item.fileName}</Text>
                  </View>
                  <View style={styles.itemActions}>
                    <Pressable style={styles.openButton} onPress={() => openSyllabus(item.uri)}>
                      <Text style={styles.openButtonText}>Abrir</Text>
                    </Pressable>
                    <Pressable style={styles.deleteButton} onPress={() => deleteSyllabus(item.id)}>
                      <Text style={styles.deleteButtonText}>Eliminar</Text>
                    </Pressable>
                    <Text style={styles.itemType}>{item.mimeType}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Calendario</Text>

          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={calendarTopic}
              onValueChange={(value) => setCalendarTopic(String(value))}
            >
              <Picker.Item label="Selecciona un tema" value="" />
              {uploadedSyllabi.map((item) => (
                <Picker.Item key={item.id} label={item.displayName} value={item.displayName} />
              ))}
            </Picker>
          </View>

          <Calendar
            onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            firstDay={1}
            theme={{
              todayTextColor: '#1e3a8a',
              selectedDayBackgroundColor: '#1f2a44',
              arrowColor: '#1f2a44',
              dotColor: '#1f2a44'
            }}
          />

          <View style={styles.selectedDateBox}>
            <Text style={styles.selectedDateText}>
              {selectedDate ? `Dia seleccionado: ${selectedDate}` : 'Selecciona un dia en el calendario'}
            </Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Hora (ej: 18:30)"
            placeholderTextColor="#64748b"
            value={calendarTime}
            onChangeText={setCalendarTime}
          />

          <Pressable
            style={[styles.primaryButton, !canAddPlan && styles.disabledButton]}
            onPress={addStudyPlan}
            disabled={!canAddPlan}
          >
            <Text style={styles.primaryButtonText}>Anadir al calendario</Text>
          </Pressable>

          <View style={styles.listContainer}>
            {!selectedDate ? (
              <Text style={styles.emptyText}>Selecciona un dia para ver su agenda</Text>
            ) : plansForSelectedDate.length === 0 ? (
              <Text style={styles.emptyText}>No hay temas planificados para este dia</Text>
            ) : (
              plansForSelectedDate.map((entry) => (
                <View key={entry.id} style={styles.itemCard}>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{entry.topic}</Text>
                    <Text style={styles.itemMeta}>{entry.day}</Text>
                  </View>
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{entry.time}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f6fb'
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 18
  },
  headerCard: {
    backgroundColor: '#1f2a44',
    borderRadius: 18,
    padding: 20,
    gap: 8
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff'
  },
  subtitle: {
    fontSize: 14,
    color: '#d7def7'
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    gap: 12
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#17223b'
  },
  primaryButton: {
    backgroundColor: '#1f2a44',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  secondaryButton: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#1e3a8a',
    fontSize: 14,
    fontWeight: '700'
  },
  disabledButton: {
    opacity: 0.5
  },
  inlineBlock: {
    gap: 10,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12
  },
  selectedFileText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600'
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff'
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff'
  },
  selectedDateBox: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  selectedDateText: {
    color: '#1e3a8a',
    fontWeight: '600',
    fontSize: 13
  },
  listContainer: {
    gap: 12
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b'
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12
  },
  itemContent: {
    flex: 1,
    gap: 4
  },
  itemTitle: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600'
  },
  itemMeta: {
    fontSize: 12,
    color: '#64748b'
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: 8
  },
  itemType: {
    fontSize: 11,
    color: '#475569',
    maxWidth: 140,
    textAlign: 'right'
  },
  openButton: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  openButtonText: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 12
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  deleteButtonText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 12
  },
  timeBadge: {
    backgroundColor: '#e7f8ef',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999
  },
  timeBadgeText: {
    color: '#157f3d',
    fontWeight: '700',
    fontSize: 12
  }
});
