import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Image,
  Alert,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Modal,
  StatusBar,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import {
  CormorantGaramond_700Bold,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
} from "@expo-google-fonts/cormorant-garamond";
import {
  Jost_400Regular,
  Jost_500Medium,
  Jost_600SemiBold,
  Jost_700Bold,
} from "@expo-google-fonts/jost";

// ---------- Config ----------
const APP_NAME = "nuura";
const APP_TAGLINE = "protein, personalized for you";
const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API = `${BACKEND}/api`;

const C = {
  bg: "#faf6f1",
  surface: "#ffffff",
  border: "#e8ddd4",
  primary: "#b5679a",
  primarySoft: "#c98ab3",
  accent: "#e8a87c",
  green: "#5a9e7c",
  text: "#2a1f2e",
  muted: "#9b8fa8",
  card: "#ffffff",
  sub: "#f5ede6",
};

const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
};

// ---------- Helpers ----------
type Goal = "maintain" | "build" | "lose" | "active";

function calcProtein(weightLbs: number, goal: Goal, age: number) {
  const kg = weightLbs * 0.453592;
  let m = 0.8;
  if (goal === "maintain") m = age >= 50 ? 1.0 : 0.8;
  else if (goal === "build") m = age >= 50 ? 1.4 : 1.6;
  else if (goal === "lose") m = age >= 50 ? 1.2 : 1.4;
  else if (goal === "active") m = age >= 50 ? 1.3 : 1.8;
  return Math.round(kg * m);
}

const GOAL_OPTIONS: { id: Goal; label: string; emoji: string; desc: string }[] = [
  { id: "maintain", label: "Stay healthy", emoji: "🌿", desc: "Maintain muscle & wellness" },
  { id: "lose", label: "Lose weight", emoji: "✨", desc: "Preserve lean muscle mass" },
  { id: "build", label: "Build muscle", emoji: "💪", desc: "Support strength & hypertrophy" },
  { id: "active", label: "Athletic", emoji: "🏃", desc: "High-performance fuelling" },
];

const FOOD_SOURCES = [
  { emoji: "🥚", name: "Eggs", g: 6, per: "per egg" },
  { emoji: "🐟", name: "Salmon", g: 34, per: "per 100g" },
  { emoji: "🍗", name: "Chicken breast", g: 31, per: "per 100g" },
  { emoji: "🫘", name: "Lentils", g: 18, per: "per cup" },
  { emoji: "🥛", name: "Greek yogurt", g: 17, per: "per 170g" },
  { emoji: "🌰", name: "Edamame", g: 17, per: "per cup" },
  { emoji: "🧀", name: "Cottage cheese", g: 25, per: "per cup" },
  { emoji: "🫙", name: "Tofu", g: 20, per: "per cup" },
];

const TABS = ["today", "calculator", "sources", "week", "month"] as const;
type Tab = (typeof TABS)[number];

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const dateNDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const ensureUserId = async (): Promise<string> => {
  let id = await AsyncStorage.getItem("nuura_user_id");
  if (!id) {
    id = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem("nuura_user_id", id);
  }
  return id;
};

// ---------- Types ----------
type SourceType = "animal" | "plant" | "supplement";

type MealEntry = {
  id?: string;
  name: string;
  protein: number;
  emoji: string;
  note?: string;
  imageUrl?: string;
  time: string;
  date?: string;
  source?: SourceType;
};

const PLANT_KEYWORDS = [
  "tofu", "lentil", "bean", "edamame", "chickpea", "quinoa", "tempeh", "seitan",
  "almond", "peanut", "cashew", "walnut", "pistachio", "hummus", "soy", "oat",
  "vegetable", "broccoli", "spinach", "kale", "salad", "veggie", "pea ", "peas",
  "rice", "bread", "pasta", "noodle",
];
const SUPPLEMENT_KEYWORDS = [
  "shake", "powder", "whey", "casein", "isolate", "bar", "protein bar", "smoothie",
  "supplement", "scoop",
];

function inferSource(name?: string, explicit?: SourceType): SourceType {
  if (explicit === "animal" || explicit === "plant" || explicit === "supplement") return explicit;
  const n = (name || "").toLowerCase();
  for (const kw of SUPPLEMENT_KEYWORDS) if (n.includes(kw)) return "supplement";
  for (const kw of PLANT_KEYWORDS) if (n.includes(kw)) return "plant";
  return "animal";
}

// ---------- Small components ----------
function Card({ children, style }: any) {
  return (
    <View
      style={[
        {
          backgroundColor: C.card,
          borderRadius: 24,
          padding: 20,
          borderWidth: 1,
          borderColor: C.border,
          ...SHADOW,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Ring({ pct, current, goal }: { pct: number; current: number; goal: number }) {
  const r = 70;
  const stroke = 12;
  const size = (r + stroke) * 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  const color = pct >= 100 ? C.green : C.primary;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.sub} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontFamily: "CormorantGaramond_700Bold", fontSize: 36, color: C.text }}>
          {current}
        </Text>
        <Text style={{ fontFamily: "Jost_500Medium", fontSize: 11, color: C.muted, letterSpacing: 1 }}>
          OF {goal}G
        </Text>
        <Text
          style={{
            fontFamily: "Jost_600SemiBold",
            fontSize: 10,
            color,
            letterSpacing: 1,
            marginTop: 2,
          }}
        >
          {pct >= 100 ? "GOAL HIT ✦" : `${Math.round(pct)}%`}
        </Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  onPress,
  children,
  testID,
  disabled,
}: {
  onPress: () => void;
  children: React.ReactNode;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={{
        backgroundColor: disabled ? C.muted : C.primary,
        paddingVertical: 16,
        borderRadius: 22,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontFamily: "Jost_600SemiBold",
          fontSize: 16,
          letterSpacing: 0.5,
        }}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}

// ---------- Main ----------
export default function Nuura() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_700Bold,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    Jost_400Regular,
    Jost_500Medium,
    Jost_600SemiBold,
    Jost_700Bold,
  });

  const [tab, setTab] = useState<Tab>("today");
  const [userId, setUserId] = useState<string>("");
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<"lbs" | "kg">("lbs");
  const [fitnessGoal, setFitnessGoal] = useState<Goal>("maintain");
  const [age, setAge] = useState("");
  const [calcResult, setCalcResult] = useState<number | null>(null);

  const [dailyGoal, setDailyGoal] = useState(120);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  const [weekTotals, setWeekTotals] = useState<Record<string, number>>({});
  const [monthTotals, setMonthTotals] = useState<Record<string, number>>({});

  // Edit/delete state
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [editName, setEditName] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editSource, setEditSource] = useState<SourceType>("animal");

  const openEdit = (m: MealEntry) => {
    setEditing(m);
    setEditName(m.name);
    setEditProtein(String(m.protein));
    setEditSource(inferSource(m.name, m.source));
  };

  const closeEdit = () => {
    setEditing(null);
    setEditName("");
    setEditProtein("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const protein = Math.max(0, Math.min(parseInt(editProtein) || 0, 300));
    const name = editName.trim() || editing.name;
    const updated = entries.map((e) =>
      e === editing ? { ...e, name, protein, source: editSource } : e
    );
    setEntries(updated);
    await AsyncStorage.setItem(`nuura_meals_${todayStr()}`, JSON.stringify(updated));
    if (editing.id) {
      try {
        await fetch(`${API}/meals/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, name, protein, source: editSource }),
        });
      } catch {}
    }
    await loadWeekTotals(userId);
    await loadMonthTotals(userId);
    showToast("Meal updated ✦");
    closeEdit();
  };

  const deleteMeal = (m: MealEntry) => {
    const doDelete = async () => {
      const updated = entries.filter((e) => e !== m);
      setEntries(updated);
      await AsyncStorage.setItem(`nuura_meals_${todayStr()}`, JSON.stringify(updated));
      if (m.id) {
        try {
          await fetch(`${API}/meals/${m.id}?user_id=${userId}`, { method: "DELETE" });
        } catch {}
      }
      await loadWeekTotals(userId);
      await loadMonthTotals(userId);
      showToast("Meal removed");
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-undef
      if (typeof window !== "undefined" && window.confirm(`Delete "${m.name}" — ${m.protein}g?`)) {
        doDelete();
      }
      return;
    }
    Alert.alert("Delete this meal?", `${m.name} — ${m.protein}g`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  // ----- Bootstrap -----
  useEffect(() => {
    (async () => {
      const id = await ensureUserId();
      setUserId(id);

      // Try server profile first, fallback local
      let profile: any = null;
      try {
        const r = await fetch(`${API}/profile/${id}`);
        if (r.ok) profile = await r.json();
      } catch {}

      if (!profile) {
        const local = await AsyncStorage.getItem("nuura_profile");
        if (local) profile = JSON.parse(local);
      }

      if (profile && profile.dailyGoal) {
        setDailyGoal(profile.dailyGoal);
        setWeight(String(profile.weight || ""));
        setUnit(profile.unit || "lbs");
        setAge(String(profile.age || ""));
        setFitnessGoal(profile.fitnessGoal || "maintain");
      } else {
        setShowOnboarding(true);
      }

      await loadTodayMeals(id);
      await loadWeekTotals(id);
      await loadMonthTotals(id);
      setBootstrapping(false);
    })();
  }, []);

  const loadTodayMeals = async (id: string) => {
    const date = todayStr();
    try {
      const r = await fetch(`${API}/meals?user_id=${id}&date=${date}`);
      if (r.ok) {
        const data = await r.json();
        setEntries(data);
        return;
      }
    } catch {}
    const local = await AsyncStorage.getItem(`nuura_meals_${date}`);
    if (local) setEntries(JSON.parse(local));
  };

  const loadWeekTotals = async (id: string) => {
    const start = dateNDaysAgo(6);
    const end = todayStr();
    try {
      const r = await fetch(`${API}/meals/range?user_id=${id}&start=${start}&end=${end}`);
      if (r.ok) {
        const data = await r.json();
        setWeekTotals(data.totals || {});
      }
    } catch {}
  };

  const loadMonthTotals = async (id: string) => {
    const start = dateNDaysAgo(29);
    const end = todayStr();
    try {
      const r = await fetch(`${API}/meals/range?user_id=${id}&start=${start}&end=${end}`);
      if (r.ok) {
        const data = await r.json();
        setMonthTotals(data.totals || {});
      }
    } catch {}
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ----- Camera / analyze -----
  const snapMeal = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera permission needed", "Please allow nuura to access your camera in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;
    await processImage(result.assets[0].base64!, result.assets[0].uri);
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos permission needed", "Please allow nuura to access your photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;
    await processImage(result.assets[0].base64!, result.assets[0].uri);
  };

  const processImage = async (base64: string, uri: string) => {
    setAnalyzing(true);
    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, user_id: userId }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "API error");
      }
      const food = await res.json();
      const source: SourceType = inferSource(food.name, food.source);
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const date = todayStr();
      const localEntry: MealEntry = {
        name: food.name,
        protein: food.protein,
        emoji: food.emoji,
        note: food.note,
        imageUrl: uri,
        time,
        date,
        source,
      };

      // persist to backend
      try {
        const save = await fetch(`${API}/meals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            name: food.name,
            protein: food.protein,
            emoji: food.emoji,
            note: food.note,
            imageUrl: "",
            time,
            date,
            source,
          }),
        });
        if (save.ok) {
          const saved = await save.json();
          localEntry.id = saved.id;
        }
      } catch {}

      const updated = [localEntry, ...entries];
      setEntries(updated);
      await AsyncStorage.setItem(`nuura_meals_${date}`, JSON.stringify(updated));
      await loadWeekTotals(userId);
      await loadMonthTotals(userId);
      showToast(`+${food.protein}g logged ✦`);
    } catch (e: any) {
      Alert.alert("Could not analyze", "Please try a clearer photo of your food.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ----- Calculator -----
  const runCalc = () => {
    if (!weight || isNaN(Number(weight))) {
      Alert.alert("Enter your weight", "Please type your weight to calculate your goal.");
      return;
    }
    const wLbs = unit === "kg" ? parseFloat(weight) * 2.20462 : parseFloat(weight);
    const a = parseInt(age) || 30;
    setCalcResult(calcProtein(wLbs, fitnessGoal, a));
  };

  const applyGoal = async () => {
    if (!calcResult) return;
    setDailyGoal(calcResult);
    const profile = {
      user_id: userId,
      weight: parseFloat(weight) || 0,
      unit,
      age: parseInt(age) || 30,
      fitnessGoal,
      dailyGoal: calcResult,
    };
    await AsyncStorage.setItem("nuura_profile", JSON.stringify(profile));
    try {
      await fetch(`${API}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
    } catch {}
    showToast(`Daily goal set to ${calcResult}g ✦`);
    setShowOnboarding(false);
    setTab("today");
  };

  // ----- Derived -----
  const total = useMemo(() => entries.reduce((s, e) => s + (e.protein || 0), 0), [entries]);
  const pct = (total / dailyGoal) * 100;

  if (!fontsLoaded || bootstrapping) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  // ----- Render -----
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} testID="nuura-root">
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={styles.brand}>
            {APP_NAME}
            <Text style={{ color: C.accent }}>.</Text>
          </Text>
          <Text style={[styles.tagline, { marginLeft: 8 }]}>{APP_TAGLINE}</Text>
        </View>
        <View style={styles.goalPill} testID="header-daily-goal">
          <Text style={{ color: C.muted, fontFamily: "Jost_500Medium", fontSize: 10, letterSpacing: 1 }}>
            DAILY GOAL
          </Text>
          <Text style={{ color: C.text, fontFamily: "CormorantGaramond_700Bold", fontSize: 22 }}>
            {dailyGoal}g
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 100, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ───── TODAY ───── */}
        {tab === "today" && (
          <>
            <Card>
              <Text style={styles.cardTitle}>
                {Math.max(0, dailyGoal - total)}g remaining today
              </Text>
              <Text
                style={{
                  fontFamily: "CormorantGaramond_400Regular_Italic",
                  fontSize: 16,
                  color: pct >= 100 ? C.green : C.primary,
                  marginTop: 4,
                }}
              >
                {pct >= 100
                  ? "You hit your goal today 🌟"
                  : pct >= 70
                  ? "Almost there — keep going"
                  : pct >= 40
                  ? "Good progress, stay fuelled"
                  : "Let's nourish your body ✨"}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 18, gap: 16 }}>
                <Ring pct={pct} current={total} goal={dailyGoal} />
                <View style={{ flex: 1, gap: 10 }}>
                  <View>
                    <Text style={{ fontFamily: "CormorantGaramond_700Bold", fontSize: 30, color: C.text }}>
                      {total}
                    </Text>
                    <Text style={{ fontFamily: "Jost_500Medium", color: C.muted, fontSize: 12, letterSpacing: 1 }}>
                      G EATEN
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{
                        fontFamily: "Jost_600SemiBold",
                        fontSize: 13,
                        color: pct >= 100 ? C.green : C.primary,
                      }}
                    >
                      {pct >= 100
                        ? `+${total - dailyGoal}g over`
                        : `${Math.max(0, dailyGoal - total)}g to go`}
                    </Text>
                    <Text style={{ fontFamily: "Jost_400Regular", color: C.muted, fontSize: 12, marginTop: 2 }}>
                      Goal: {dailyGoal}g
                    </Text>
                  </View>
                </View>
              </View>
            </Card>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                testID="snap-meal-btn"
                onPress={snapMeal}
                disabled={analyzing}
                activeOpacity={0.85}
                style={[styles.snapBtn, { flex: 1.4 }]}
              >
                {analyzing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={{ fontSize: 22 }}>📸</Text>
                    <Text style={styles.snapBtnText}>Snap a meal</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="pick-meal-btn"
                onPress={pickFromLibrary}
                disabled={analyzing}
                activeOpacity={0.85}
                style={[styles.snapBtnAlt, { flex: 1 }]}
              >
                <Text style={{ fontSize: 18 }}>🖼️</Text>
                <Text style={[styles.snapBtnText, { color: C.primary }]}>Upload</Text>
              </TouchableOpacity>
            </View>

            <Card>
              <Text style={styles.cardTitle}>Today's log</Text>
              <View style={{ gap: 12, marginTop: 12 }}>
                {entries.length === 0 && (
                  <Text style={{ color: C.muted, fontFamily: "CormorantGaramond_400Regular_Italic", fontSize: 16 }}>
                    No meals yet — snap your first ✦
                  </Text>
                )}
                {entries.map((e, i) => (
                  <TouchableOpacity
                    key={(e.id || "") + i}
                    testID={`meal-row-${i}`}
                    onLongPress={() => deleteMeal(e)}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 8,
                      borderBottomWidth: i === entries.length - 1 ? 0 : 1,
                      borderBottomColor: C.border,
                    }}
                  >
                    {e.imageUrl ? (
                      <Image
                        source={{ uri: e.imageUrl }}
                        style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.sub }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 14,
                          backgroundColor: C.sub,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 24 }}>{e.emoji}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Jost_600SemiBold", color: C.text, fontSize: 15 }}>
                        {e.name}
                      </Text>
                      {e.note ? (
                        <Text
                          style={{
                            fontFamily: "CormorantGaramond_400Regular_Italic",
                            color: C.muted,
                            fontSize: 13,
                            marginTop: 2,
                          }}
                        >
                          {e.note}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontFamily: "CormorantGaramond_700Bold", color: C.primary, fontSize: 22 }}>
                        {e.protein}g
                      </Text>
                      <Text style={{ fontFamily: "Jost_400Regular", color: C.muted, fontSize: 11 }}>
                        {e.time}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", marginLeft: 4, gap: 4 }}>
                      <TouchableOpacity
                        testID={`meal-edit-${i}`}
                        onPress={() => openEdit(e)}
                        hitSlop={8}
                        style={styles.iconBtn}
                      >
                        <Text style={{ fontSize: 14, color: C.primary }}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`meal-delete-${i}`}
                        onPress={() => deleteMeal(e)}
                        hitSlop={8}
                        style={styles.iconBtn}
                      >
                        <Text style={{ fontSize: 14, color: C.muted }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          </>
        )}

        {/* ───── CALCULATOR ───── */}
        {tab === "calculator" && (
          <CalculatorView
            weight={weight}
            setWeight={setWeight}
            unit={unit}
            setUnit={setUnit}
            age={age}
            setAge={setAge}
            fitnessGoal={fitnessGoal}
            setFitnessGoal={setFitnessGoal}
            calcResult={calcResult}
            runCalc={runCalc}
            applyGoal={applyGoal}
          />
        )}

        {/* ───── SOURCES ───── */}
        {tab === "sources" && (
          <SourcesView entries={entries} total={total} />
        )}

        {/* ───── WEEK ───── */}
        {tab === "week" && (
          <WeekView weekTotals={weekTotals} dailyGoal={dailyGoal} todayTotal={total} />
        )}

        {/* ───── MONTH ───── */}
        {tab === "month" && <MonthView monthTotals={monthTotals} dailyGoal={dailyGoal} todayTotal={total} />}
      </ScrollView>

      {/* BOTTOM TAB BAR */}
      <View style={styles.bottomBar}>
        {[
          { id: "today", icon: "◉", label: "Today" },
          { id: "calculator", icon: "✦", label: "Goal" },
          { id: "sources", icon: "❋", label: "Sources" },
          { id: "week", icon: "◈", label: "Week" },
          { id: "month", icon: "❖", label: "Month" },
        ].map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              testID={`bottom-tab-${t.id}`}
              onPress={() => setTab(t.id as Tab)}
              activeOpacity={0.85}
              style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 18, color: active ? C.primary : C.muted }}>{t.icon}</Text>
              <Text
                style={{
                  fontFamily: "Jost_500Medium",
                  fontSize: 10,
                  color: active ? C.primary : C.muted,
                  letterSpacing: 0.6,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* TOAST */}
      {toast ? (
        <View style={styles.toast} testID="toast">
          <Text style={{ color: "#fff", fontFamily: "Jost_600SemiBold" }}>{toast}</Text>
        </View>
      ) : null}

      {/* EDIT MEAL MODAL */}
      <Modal visible={!!editing} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(42,31,46,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View
              style={{
                backgroundColor: C.bg,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 20,
                paddingBottom: 32,
                gap: 14,
              }}
            >
              <View style={{ alignItems: "center", marginBottom: 4 }}>
                <View
                  style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: C.border }}
                />
              </View>
              <Text style={{ fontFamily: "CormorantGaramond_700Bold", fontSize: 24, color: C.text }}>
                Edit meal
              </Text>
              <Text style={styles.label}>Name</Text>
              <TextInput
                testID="edit-name-input"
                value={editName}
                onChangeText={setEditName}
                style={styles.input}
              />
              <Text style={styles.label}>Protein (g)</Text>
              <TextInput
                testID="edit-protein-input"
                value={editProtein}
                onChangeText={setEditProtein}
                keyboardType="numeric"
                style={styles.input}
              />
              <Text style={styles.label}>Source</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["animal", "plant", "supplement"] as SourceType[]).map((s) => {
                  const active = editSource === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      testID={`edit-source-${s}`}
                      onPress={() => setEditSource(s)}
                      activeOpacity={0.85}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: active ? C.primary : C.border,
                        backgroundColor: active ? `${C.primary}15` : C.surface,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: active ? C.primary : C.muted,
                          fontFamily: "Jost_600SemiBold",
                          fontSize: 13,
                          textTransform: "capitalize",
                        }}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  testID="edit-cancel-btn"
                  onPress={closeEdit}
                  activeOpacity={0.85}
                  style={{
                    flex: 1,
                    paddingVertical: 16,
                    borderRadius: 18,
                    borderWidth: 1.5,
                    borderColor: C.border,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.muted, fontFamily: "Jost_600SemiBold", fontSize: 14 }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="edit-save-btn"
                  onPress={saveEdit}
                  activeOpacity={0.85}
                  style={{
                    flex: 1.6,
                    backgroundColor: C.primary,
                    paddingVertical: 16,
                    borderRadius: 18,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontFamily: "Jost_600SemiBold", fontSize: 14 }}>
                    Save changes
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ONBOARDING MODAL */}
      <Modal visible={showOnboarding} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 12 }}>
              <View style={{ alignItems: "center", gap: 2 }}>
                <Text
                  style={{
                    fontFamily: "CormorantGaramond_700Bold",
                    fontSize: 36,
                    color: C.text,
                  }}
                >
                  {APP_NAME}
                  <Text style={{ color: C.accent }}>.</Text>
                </Text>
                <Text
                  style={{
                    fontFamily: "CormorantGaramond_400Regular_Italic",
                    fontSize: 15,
                    color: C.muted,
                  }}
                >
                  let's personalize your protein
                </Text>
              </View>
              <CalculatorView
                weight={weight}
                setWeight={setWeight}
                unit={unit}
                setUnit={setUnit}
                age={age}
                setAge={setAge}
                fitnessGoal={fitnessGoal}
                setFitnessGoal={setFitnessGoal}
                calcResult={calcResult}
                runCalc={runCalc}
                applyGoal={applyGoal}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- Calculator subview ----------
function CalculatorView({
  weight,
  setWeight,
  unit,
  setUnit,
  age,
  setAge,
  fitnessGoal,
  setFitnessGoal,
  calcResult,
  runCalc,
  applyGoal,
}: any) {
  return (
    <Card>
      <Text style={styles.cardTitle}>Personalize your protein goal</Text>

      <Text style={styles.label}>Your weight</Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
        <TextInput
          testID="calc-weight-input"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="e.g. 145"
          placeholderTextColor={C.muted}
          style={[styles.input, { flex: 1 }]}
        />
        <View style={{ flexDirection: "row", borderRadius: 14, backgroundColor: C.sub, padding: 4 }}>
          {(["lbs", "kg"] as const).map((u) => (
            <TouchableOpacity
              key={u}
              testID={`unit-${u}`}
              onPress={() => setUnit(u)}
              activeOpacity={0.85}
              style={{
                paddingHorizontal: 14,
                justifyContent: "center",
                borderRadius: 10,
                backgroundColor: unit === u ? C.primary : "transparent",
              }}
            >
              <Text
                style={{
                  color: unit === u ? "#fff" : C.muted,
                  fontFamily: "Jost_600SemiBold",
                  fontSize: 13,
                }}
              >
                {u}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.label}>
        Age <Text style={{ fontFamily: "CormorantGaramond_400Regular_Italic", color: C.muted }}>
          (adjusts 50+ recs)
        </Text>
      </Text>
      <TextInput
        testID="calc-age-input"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
        placeholder="e.g. 32"
        placeholderTextColor={C.muted}
        style={styles.input}
      />

      <Text style={styles.label}>Your goal</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
        {GOAL_OPTIONS.map((g) => {
          const active = fitnessGoal === g.id;
          return (
            <TouchableOpacity
              key={g.id}
              testID={`goal-${g.id}`}
              onPress={() => setFitnessGoal(g.id)}
              activeOpacity={0.85}
              style={{
                width: "48%",
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: active ? C.primary : C.border,
                backgroundColor: active ? `${C.primary}15` : C.sub,
              }}
            >
              <Text style={{ fontSize: 24 }}>{g.emoji}</Text>
              <Text
                style={{
                  fontFamily: "Jost_600SemiBold",
                  color: C.text,
                  fontSize: 14,
                  marginTop: 4,
                }}
              >
                {g.label}
              </Text>
              <Text
                style={{
                  fontFamily: "CormorantGaramond_400Regular_Italic",
                  color: C.muted,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {g.desc}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ marginTop: 18 }}>
        <PrimaryButton testID="calc-submit-btn" onPress={runCalc}>
          Calculate my protein goal
        </PrimaryButton>
      </View>

      {calcResult ? (
        <View
          style={{
            marginTop: 18,
            padding: 18,
            borderRadius: 22,
            backgroundColor: `${C.primary}10`,
            borderWidth: 1,
            borderColor: `${C.primary}40`,
            alignItems: "center",
          }}
          testID="calc-result"
        >
          <Text style={{ fontFamily: "Jost_500Medium", color: C.muted, fontSize: 11, letterSpacing: 1 }}>
            YOUR PERSONALIZED GOAL
          </Text>
          <Text
            style={{
              fontFamily: "CormorantGaramond_700Bold",
              fontSize: 64,
              color: C.primary,
              marginTop: 4,
            }}
          >
            {calcResult}
            <Text style={{ fontSize: 24 }}>g/day</Text>
          </Text>
          <Text
            style={{
              fontFamily: "CormorantGaramond_400Regular_Italic",
              fontSize: 14,
              color: C.text,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            Based on your weight{age ? `, age ${age}` : ""} and{" "}
            {GOAL_OPTIONS.find((g) => g.id === fitnessGoal)?.label.toLowerCase()} goal.
          </Text>
          <View style={{ width: "100%", marginTop: 14 }}>
            <PrimaryButton testID="apply-goal-btn" onPress={applyGoal}>
              Set as my daily goal →
            </PrimaryButton>
          </View>
        </View>
      ) : null}

      <Text
        style={{
          marginTop: 16,
          fontFamily: "CormorantGaramond_400Regular_Italic",
          fontSize: 13,
          color: C.muted,
          lineHeight: 20,
        }}
      >
        Recommendations follow ISSN & ACSM guidelines. Adults 50+ are set higher (1.0–1.4g/kg) to counteract
        sarcopenia. Athletes up to 1.8g/kg.
      </Text>
    </Card>
  );
}

// ---------- Sources subview ----------
function SourcesView({ entries, total }: { entries: MealEntry[]; total: number }) {
  const breakdown = useMemo(() => {
    const acc: Record<SourceType, number> = { animal: 0, plant: 0, supplement: 0 };
    entries.forEach((e) => {
      const src = inferSource(e.name, e.source);
      acc[src] += e.protein || 0;
    });
    return acc;
  }, [entries]);

  const t = Math.max(total, 1);
  const sourceDefs: { key: SourceType; label: string; emoji: string; color: string }[] = [
    { key: "animal", label: "Animal", emoji: "🍗", color: C.primary },
    { key: "plant", label: "Plant", emoji: "🌱", color: C.green },
    { key: "supplement", label: "Supplements", emoji: "🥤", color: C.accent },
  ];

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Today's protein mix</Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 14,
            marginTop: 4,
          }}
        >
          {total > 0 ? "Where today's protein came from." : "Log a meal to see your mix."}
        </Text>

        {/* segmented bar */}
        <View
          style={{
            height: 14,
            borderRadius: 8,
            overflow: "hidden",
            flexDirection: "row",
            marginTop: 16,
            backgroundColor: C.sub,
          }}
        >
          {sourceDefs.map((s) => {
            const w = total > 0 ? (breakdown[s.key] / t) * 100 : 0;
            if (w <= 0) return null;
            return <View key={s.key} style={{ width: `${w}%`, backgroundColor: s.color }} />;
          })}
        </View>

        <View style={{ marginTop: 14, gap: 10 }}>
          {sourceDefs.map((s) => {
            const grams = breakdown[s.key];
            const pct = total > 0 ? Math.round((grams / t) * 100) : 0;
            return (
              <View
                key={s.key}
                testID={`source-row-${s.key}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: C.sub,
                  padding: 14,
                  borderRadius: 16,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: `${s.color}25`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Jost_600SemiBold", color: C.text, fontSize: 15 }}>
                    {s.label}
                  </Text>
                  <Text style={{ fontFamily: "Jost_400Regular", color: C.muted, fontSize: 12 }}>
                    {grams}g logged today
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: "CormorantGaramond_700Bold",
                    color: s.color,
                    fontSize: 24,
                  }}
                >
                  {pct}%
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Top protein sources</Text>
        <View style={{ marginTop: 14, gap: 10 }}>
          {FOOD_SOURCES.map((f, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: C.sub,
                padding: 14,
                borderRadius: 16,
              }}
            >
              <Text style={{ fontSize: 26 }}>{f.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Jost_600SemiBold", color: C.text, fontSize: 15 }}>
                  {f.name}
                </Text>
                <Text style={{ fontFamily: "Jost_400Regular", color: C.muted, fontSize: 12 }}>
                  {f.per}
                </Text>
              </View>
              <Text style={{ fontFamily: "CormorantGaramond_700Bold", color: C.primary, fontSize: 22 }}>
                {f.g}g
              </Text>
            </View>
          ))}
        </View>
        <Text
          style={{
            marginTop: 16,
            fontFamily: "CormorantGaramond_400Regular_Italic",
            fontSize: 14,
            color: C.muted,
            lineHeight: 20,
          }}
        >
          💡 Mix animal & plant proteins for a complete amino acid profile. Pair lentils with rice, or tofu
          with edamame for max bioavailability.
        </Text>
      </Card>
    </>
  );
}

// ---------- Week subview ----------
function WeekView({
  weekTotals,
  dailyGoal,
  todayTotal,
}: {
  weekTotals: Record<string, number>;
  dailyGoal: number;
  todayTotal: number;
}) {
  const days = Array.from({ length: 7 }, (_, i) => dateNDaysAgo(6 - i));
  const dayLabels = days.map((d) => {
    const dt = new Date(d);
    return ["S", "M", "T", "W", "T", "F", "S"][dt.getDay()];
  });
  const todayKey = todayStr();
  const totals = days.map((d) => (d === todayKey ? todayTotal : weekTotals[d] || 0));
  const avg = Math.round(totals.reduce((a, b) => a + b, 0) / 7);
  const best = Math.max(...totals);
  const hits = totals.filter((v) => v >= dailyGoal).length;

  return (
    <Card>
      <Text style={styles.cardTitle}>This week</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, height: 180 }}>
        {totals.map((v, i) => {
          const barH = Math.max(6, (v / Math.max(dailyGoal, 1)) * 140);
          const isToday = days[i] === todayKey;
          const hit = v >= dailyGoal;
          return (
            <View key={i} style={{ alignItems: "center", flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontFamily: "Jost_500Medium",
                  fontSize: 10,
                  color: C.muted,
                }}
              >
                {v}
              </Text>
              <View
                style={{
                  width: 22,
                  height: barH,
                  borderRadius: 12,
                  backgroundColor: isToday ? C.primary : hit ? C.green : C.accent,
                  opacity: isToday ? 1 : 0.85,
                }}
              />
              <Text
                style={{
                  fontFamily: "Jost_600SemiBold",
                  color: isToday ? C.primary : C.muted,
                  fontSize: 12,
                }}
              >
                {dayLabels[i]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", marginTop: 18, gap: 10 }}>
        {[
          { label: "Avg / day", val: `${avg}g` },
          { label: "Best day", val: `${best}g` },
          { label: "Goals hit", val: `${hits}/7` },
        ].map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1,
              backgroundColor: C.sub,
              borderRadius: 16,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: "CormorantGaramond_700Bold", color: C.text, fontSize: 22 }}>
              {s.val}
            </Text>
            <Text style={{ fontFamily: "Jost_500Medium", color: C.muted, fontSize: 11, letterSpacing: 0.6 }}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ---------- Month subview ----------
function MonthView({
  monthTotals,
  dailyGoal,
  todayTotal,
}: {
  monthTotals: Record<string, number>;
  dailyGoal: number;
  todayTotal: number;
}) {
  const days = Array.from({ length: 30 }, (_, i) => dateNDaysAgo(29 - i));
  const todayKey = todayStr();
  const totals = days.map((d) => (d === todayKey ? todayTotal : monthTotals[d] || 0));
  const avg = Math.round(totals.reduce((a, b) => a + b, 0) / 30);
  const best = Math.max(...totals);
  const hits = totals.filter((v) => v >= dailyGoal).length;
  const total30 = totals.reduce((a, b) => a + b, 0);

  const cellColor = (v: number) => {
    if (v <= 0) return C.sub;
    const ratio = Math.min(v / dailyGoal, 1);
    if (ratio >= 1) return C.green;
    if (ratio >= 0.66) return C.primary;
    if (ratio >= 0.33) return C.primarySoft;
    return C.accent;
  };

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Last 30 days</Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 14,
            marginTop: 4,
          }}
        >
          Each square is a day — fuller colour, fuller protein.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
          {totals.map((v, i) => {
            const isToday = days[i] === todayKey;
            return (
              <View
                key={i}
                testID={`month-cell-${i}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: cellColor(v),
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: isToday ? 2 : 0,
                  borderColor: C.text,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Jost_600SemiBold",
                    fontSize: 9,
                    color: v <= 0 ? C.muted : "#fff",
                  }}
                >
                  {new Date(days[i]).getDate()}
                </Text>
              </View>
            );
          })}
        </View>

        {/* legend */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
          <Text style={{ fontFamily: "Jost_500Medium", fontSize: 10, color: C.muted, letterSpacing: 0.6 }}>
            LESS
          </Text>
          {[C.sub, C.accent, C.primarySoft, C.primary, C.green].map((c, i) => (
            <View
              key={i}
              style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: c }}
            />
          ))}
          <Text style={{ fontFamily: "Jost_500Medium", fontSize: 10, color: C.muted, letterSpacing: 0.6 }}>
            MORE
          </Text>
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Monthly summary</Text>
        <View style={{ flexDirection: "row", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Avg / day", val: `${avg}g` },
            { label: "Best day", val: `${best}g` },
            { label: "Goals hit", val: `${hits}/30` },
            { label: "Total", val: `${total30}g` },
          ].map((s) => (
            <View
              key={s.label}
              style={{
                width: "48%",
                backgroundColor: C.sub,
                borderRadius: 16,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: "CormorantGaramond_700Bold", color: C.text, fontSize: 26 }}>
                {s.val}
              </Text>
              <Text
                style={{ fontFamily: "Jost_500Medium", color: C.muted, fontSize: 11, letterSpacing: 0.6 }}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 32,
    color: C.text,
  },
  tagline: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 13,
    color: C.muted,
  },
  goalPill: {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  topTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
  },
  cardTitle: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 24,
    color: C.text,
  },
  label: {
    fontFamily: "Jost_500Medium",
    fontSize: 11,
    color: C.muted,
    letterSpacing: 1.2,
    marginTop: 14,
  },
  input: {
    marginTop: 6,
    backgroundColor: C.sub,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Jost_500Medium",
    fontSize: 16,
    color: C.text,
  },
  snapBtn: {
    backgroundColor: C.primary,
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    ...SHADOW,
  },
  snapBtnAlt: {
    backgroundColor: C.surface,
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  snapBtnText: {
    color: "#fff",
    fontFamily: "Jost_600SemiBold",
    fontSize: 15,
    letterSpacing: 0.4,
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingVertical: 8,
    paddingBottom: Platform.OS === "ios" ? 22 : 12,
  },
  toast: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    backgroundColor: C.text,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    ...SHADOW,
  },
  iconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.sub,
    alignItems: "center",
    justifyContent: "center",
  },
});
