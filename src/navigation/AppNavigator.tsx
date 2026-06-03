import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { StudySessionScreen } from '../screens/StudySessionScreen';

export type RootStackParamList = {
  Home: undefined;
  StudySession: {
    syllabusContent: string;
    syllabusName: string;
    date: string;
    time: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="StudySession" component={StudySessionScreen} />
    </Stack.Navigator>
  );
}
