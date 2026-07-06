import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import * as StoreReview from "expo-store-review";
import ConfettiCannon from "react-native-confetti-cannon";
import { Linking } from "react-native";
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
const APP_NAME = "proteā";
const APP_TAGLINE = "protein, made personal";
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
  { id: "lose", label: "Lose weight", emoji: "✨", desc: "Preserve lean mass" },
  { id: "build", label: "Build muscle", emoji: "💪", desc: "Support strength & hypertrophy" },
  { id: "active", label: "Athletic", emoji: "🏃", desc: "High-performance fuelling" },
];

const FOOD_SOURCES = [
  { emoji: "🥚", name: "Eggs", g: 6, per: "per egg" },
  { emoji: "🐟", name: "Salmon", g: 34, per: "per 100g" },
  { emoji: "🍗", name: "Chicken breast", g: 31, per: "per 100g" },
  { emoji: "🟤", name: "Lentils", g: 18, per: "per cup" },
  { emoji: "🥣", name: "Greek yogurt", g: 17, per: "per 170g" },
  { emoji: "🫛", name: "Edamame", g: 17, per: "per cup" },
  { emoji: "🍚", name: "Cottage cheese", g: 25, per: "per cup" },
  { emoji: "⬜", name: "Tofu", g: 20, per: "per cup" },
];

const TABS = ["today", "calculator", "sources", "progress", "me"] as const;
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

  // GLP-1
  const [glp1Active, setGlp1Active] = useState(false);
  const [showGLP1Modal, setShowGLP1Modal] = useState(false);
  const GLP1_MULTIPLIER = 1.15;
  // Snapshot the BEFORE/AFTER numbers when the modal opens so the values
  // don't recompute mid-Apply (which used to flash 102→117 before closing).
  const [glp1Snapshot, setGlp1Snapshot] = useState<{ from: number; to: number }>({ from: 0, to: 0 });

  // "Me" tab subsheets & rate prompt
  const [meSheet, setMeSheet] = useState<
    null | "about" | "notif" | "privacy" | "terms" | "contact" | "subscription"
  >(null);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [notifDaily, setNotifDaily] = useState(false);
  const [notifTime, setNotifTime] = useState("12:00 PM");
  const [notifGoalCelebrate, setNotifGoalCelebrate] = useState(true);

  // Confetti — fires once per day when the user hits their protein goal
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef<any>(null);
  const confettiCheckedRef = useRef(false);

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

  // ----- GLP-1 handlers -----
  const persistGoal = async (goal: number) => {
    // Update local profile cache + backend so the new goal sticks across reloads
    try {
      const raw = await AsyncStorage.getItem("nuura_profile");
      const prof = raw ? JSON.parse(raw) : { user_id: userId };
      const updated = { ...prof, user_id: userId, dailyGoal: goal };
      await AsyncStorage.setItem("nuura_profile", JSON.stringify(updated));
      await fetch(`${API}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          weight: updated.weight || 0,
          unit: updated.unit || "lbs",
          age: updated.age || 30,
          fitnessGoal: updated.fitnessGoal || "maintain",
          dailyGoal: goal,
        }),
      });
    } catch {}
  };

  const onGLP1ToggleChange = async (val: boolean) => {
    if (val) {
      // Freeze the BEFORE/AFTER numbers when the toggle is flipped so the
      // modal can't drift mid-Apply.
      setGlp1Snapshot({
        from: dailyGoal,
        to: Math.round(dailyGoal * GLP1_MULTIPLIER),
      });
      setShowGLP1Modal(true);
    } else {
      // Restore the original goal saved before GLP-1 was applied
      const pre = await AsyncStorage.getItem("nuura_daily_goal_pre_glp1");
      const restored = pre ? parseInt(pre, 10) : dailyGoal;
      setGlp1Active(false);
      setDailyGoal(restored);
      await AsyncStorage.setItem("nuura_glp1_active", "false");
      await AsyncStorage.removeItem("nuura_daily_goal_pre_glp1");
      await persistGoal(restored);
      showToast(`Goal restored to ${restored}g ✦`);
    }
  };

  const applyGLP1Goal = async () => {
    // Read STRICTLY from the snapshot taken on toggle so the values never drift
    const baseGoal = glp1Snapshot.from || dailyGoal;
    const adjustedGoal =
      glp1Snapshot.to || Math.round(baseGoal * GLP1_MULTIPLIER);
    // Persist FIRST so the new goal is durable
    await AsyncStorage.setItem("nuura_daily_goal_pre_glp1", String(baseGoal));
    await AsyncStorage.setItem("nuura_glp1_active", "true");
    await persistGoal(adjustedGoal);
    // Close the modal immediately, but defer the header pill update until the
    // modal fade-out has finished. Otherwise the user sees the daily-goal
    // number tick over while the modal is mid-fade (the "flicker").
    setShowGLP1Modal(false);
    setTimeout(() => {
      setGlp1Active(true);
      setDailyGoal(adjustedGoal);
      showToast(`Goal updated to ${adjustedGoal}g ✦`);
    }, 320);
  };

  const cancelGLP1 = () => {
    setShowGLP1Modal(false);
    setGlp1Snapshot({ from: 0, to: 0 });
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

      const glp1Flag = await AsyncStorage.getItem("nuura_glp1_active");
      setGlp1Active(glp1Flag === "true");

      // Load notification preferences
      const nd = await AsyncStorage.getItem("notif_daily_on");
      setNotifDaily(nd === "true");
      const nt = await AsyncStorage.getItem("notif_daily_time");
      if (nt) setNotifTime(nt);
      const ngc = await AsyncStorage.getItem("notif_goal_celebrate");
      setNotifGoalCelebrate(ngc !== "false");

      await loadTodayMeals(id);
      await loadWeekTotals(id);
      await loadMonthTotals(id);
      setBootstrapping(false);
    })();
  }, []);

  const loadTodayMeals = async (id: string) => {
    const date = todayStr();
    // Local cache is the source of truth for imageUrls (backend doesn't store them)
    let localEntries: MealEntry[] = [];
    const local = await AsyncStorage.getItem(`nuura_meals_${date}`);
    if (local) {
      try {
        localEntries = JSON.parse(local);
      } catch {}
    }
    try {
      const r = await fetch(`${API}/meals?user_id=${id}&date=${date}`);
      if (r.ok) {
        const data: MealEntry[] = await r.json();
        // Merge: server is source of truth, but graft imageUrl from local cache by id
        const imgById: Record<string, string> = {};
        localEntries.forEach((e) => {
          if (e.id && e.imageUrl) imgById[e.id] = e.imageUrl;
        });
        const merged = data.map((e) =>
          e.id && imgById[e.id] ? { ...e, imageUrl: imgById[e.id] } : e
        );
        setEntries(merged);
        await AsyncStorage.setItem(`nuura_meals_${date}`, JSON.stringify(merged));
        return;
      }
    } catch {}
    setEntries(localEntries);
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
      Alert.alert("Photos permission needed", "Please allow proteā to access your photos.");
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
      // ----- Lifetime meal counter (for review prompt) -----
      try {
        const cur = await AsyncStorage.getItem("total_meals_logged");
        const next = (parseInt(cur || "0", 10) || 0) + 1;
        await AsyncStorage.setItem("total_meals_logged", String(next));
        if (next === 7) {
          // Defer slightly so the toast can render first
          setTimeout(() => setShowRatePrompt(true), 800);
        }
      } catch {}
      showToast(`+${food.protein}g logged ✦`);
    } catch (e: any) {
      Alert.alert("Couldn't analyze", "Something went wrong. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ----- Calculator -----
  const runCalc = async () => {
    if (!weight || isNaN(Number(weight))) {
      Alert.alert("Enter your weight", "Please type your weight to calculate your goal.");
      return;
    }
    const wLbs = unit === "kg" ? parseFloat(weight) * 2.20462 : parseFloat(weight);
    const a = parseInt(age) || 30;
    const baseGoal = calcProtein(wLbs, fitnessGoal, a);
    // If GLP-1 is currently active, the *applied* goal is base × 1.15. Store base
    // separately so toggling GLP-1 off later restores cleanly.
    const finalGoal = glp1Active ? Math.round(baseGoal * GLP1_MULTIPLIER) : baseGoal;
    setCalcResult(finalGoal);
    setDailyGoal(finalGoal);
    const profile = {
      user_id: userId,
      weight: parseFloat(weight) || 0,
      unit,
      age: parseInt(age) || 30,
      fitnessGoal,
      dailyGoal: finalGoal,
    };
    await AsyncStorage.setItem("nuura_profile", JSON.stringify(profile));
    try {
      await fetch(`${API}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
    } catch {}
    if (glp1Active) {
      await AsyncStorage.setItem("nuura_daily_goal_pre_glp1", String(baseGoal));
    }
    showToast(`Daily goal set to ${finalGoal}g ✦`);
    setShowOnboarding(false);
    setTab("today");
  };

  const applyGoal = async () => {
    // Kept for backwards compatibility — runCalc already applies
    if (!calcResult) return;
    showToast(`Daily goal set to ${calcResult}g ✦`);
    setShowOnboarding(false);
    setTab("today");
  };

  // ----- Derived -----
  const total = useMemo(() => entries.reduce((s, e) => s + (e.protein || 0), 0), [entries]);
  const pct = (total / dailyGoal) * 100;

  // ----- Confetti: fire once per day when goal is hit -----
  useEffect(() => {
    if (bootstrapping) return;
    if (!notifGoalCelebrate) return;
    if (total < dailyGoal || dailyGoal <= 0) return;
    if (confettiCheckedRef.current) return;
    confettiCheckedRef.current = true;
    (async () => {
      try {
        const key = "nuura_confetti_lastdate";
        const last = await AsyncStorage.getItem(key);
        const today = todayStr();
        if (last !== today) {
          setShowConfetti(true);
          await AsyncStorage.setItem(key, today);
          // Auto-hide after animation completes
          setTimeout(() => setShowConfetti(false), 4000);
        }
      } catch {}
    })();
  }, [total, dailyGoal, bootstrapping, notifGoalCelebrate]);

  // Reset the "checked" guard if the user drops below their goal again
  useEffect(() => {
    if (total < dailyGoal) confettiCheckedRef.current = false;
  }, [total, dailyGoal]);

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
            <Text style={{ color: C.primary }}>.</Text>
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
            glp1Active={glp1Active}
            onGLP1Toggle={onGLP1ToggleChange}
          />
        )}

        {/* ───── SOURCES ───── */}
        {tab === "sources" && (
          <SourcesView entries={entries} total={total} userId={userId} dailyGoal={dailyGoal} />
        )}

        {/* ───── PROGRESS (week + month combined) ───── */}
        {tab === "progress" && (
          <>
            <WeekView weekTotals={weekTotals} dailyGoal={dailyGoal} todayTotal={total} />
            <MonthView monthTotals={monthTotals} dailyGoal={dailyGoal} todayTotal={total} />
          </>
        )}

        {/* ───── ME ───── */}
        {tab === "me" && (
          <MeView
            onOpen={(k) => setMeSheet(k)}
            onRate={() => setShowRatePrompt(true)}
          />
        )}
      </ScrollView>

      {/* BOTTOM TAB BAR */}
      <View style={styles.bottomBar}>
        {[
          { id: "today", icon: "◉", label: "Today" },
          { id: "calculator", icon: "✦", label: "Goal" },
          { id: "sources", icon: "❋", label: "Sources" },
          { id: "progress", icon: "◈", label: "Progress" },
          { id: "me", icon: "♀", label: "Me" },
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
                  <Text style={{ color: C.primary }}>.</Text>
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
                glp1Active={glp1Active}
                onGLP1Toggle={onGLP1ToggleChange}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* GLP-1 INFO MODAL */}
      <Modal visible={showGLP1Modal} animationType="fade" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(42,31,46,0.55)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: C.bg,
              borderRadius: 24,
              padding: 22,
              gap: 12,
              ...SHADOW,
            }}
          >
            <Text
              style={{
                fontFamily: "CormorantGaramond_700Bold",
                fontSize: 26,
                color: C.text,
              }}
            >
              Adjusting your goal for GLP-1
            </Text>
            <Text
              style={{
                fontFamily: "Jost_400Regular",
                fontSize: 14,
                color: C.text,
                lineHeight: 21,
              }}
            >
              Women on GLP-1 medications need more protein, not less — even as appetite drops.
              Research shows a 15% higher target significantly reduces muscle loss during weight loss.
            </Text>
            <View
              style={{
                backgroundColor: `${C.primary}12`,
                borderRadius: 16,
                padding: 14,
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jost_500Medium",
                  fontSize: 11,
                  color: C.muted,
                  letterSpacing: 1,
                }}
              >
                YOUR GOAL
              </Text>
              <Text
                style={{
                  fontFamily: "CormorantGaramond_700Bold",
                  fontSize: 32,
                  color: C.primary,
                  marginTop: 4,
                }}
              >
                {glp1Snapshot.from || dailyGoal}g →{" "}
                {glp1Snapshot.to ||
                  Math.round((glp1Snapshot.from || dailyGoal) * GLP1_MULTIPLIER)}g
                <Text style={{ fontSize: 16, color: C.muted }}> /day</Text>
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "CormorantGaramond_400Regular_Italic",
                fontSize: 14,
                color: C.text,
                lineHeight: 20,
              }}
            >
              This is still very achievable — roughly one extra portion of Greek yogurt or a
              small tin of tuna.
            </Text>
            <Text
              style={{
                fontFamily: "Jost_400Regular",
                fontSize: 11,
                color: C.muted,
                lineHeight: 16,
                marginTop: 2,
              }}
            >
              Your prescribing doctor or dietitian may recommend a different target based on your
              specific medication dose and health profile. The Goal tab lets you override this at
              any time.
            </Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                testID="glp1-apply-btn"
                onPress={applyGLP1Goal}
                activeOpacity={0.85}
                style={{
                  backgroundColor: C.primary,
                  paddingVertical: 15,
                  borderRadius: 18,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "#fff", fontFamily: "Jost_600SemiBold", fontSize: 15 }}
                >
                  Apply new goal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="glp1-cancel-btn"
                onPress={cancelGLP1}
                activeOpacity={0.85}
                style={{ paddingVertical: 12, alignItems: "center" }}
              >
                <Text
                  style={{ color: C.muted, fontFamily: "Jost_600SemiBold", fontSize: 14 }}
                >
                  Keep my current goal
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ME SUB-SHEETS (about / notif / privacy / terms / contact) */}
      <Modal visible={!!meSheet} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: C.border,
            }}
          >
            <TouchableOpacity
              testID="me-sheet-close"
              onPress={() => setMeSheet(null)}
              hitSlop={10}
              style={{ padding: 6 }}
            >
              <Text style={{ fontSize: 22, color: C.text }}>‹</Text>
            </TouchableOpacity>
            <Text
              style={{
                flex: 1,
                fontFamily: "CormorantGaramond_700Bold",
                fontSize: 22,
                color: C.text,
                textAlign: "center",
                marginRight: 28,
              }}
            >
              {meSheet === "about" ? "About proteā" :
                meSheet === "notif" ? "Notifications" :
                meSheet === "privacy" ? "Privacy policy" :
                meSheet === "terms" ? "Terms & conditions" :
                meSheet === "contact" ? "Contact & feedback" : ""}
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 14 }}>
            {meSheet === "about" && <AboutContent />}
            {meSheet === "notif" && (
              <NotificationsContent
                daily={notifDaily}
                onDailyToggle={async (v) => {
                  setNotifDaily(v);
                  await AsyncStorage.setItem("notif_daily_on", v ? "true" : "false");
                }}
                time={notifTime}
                onTimeChange={async (t) => {
                  setNotifTime(t);
                  await AsyncStorage.setItem("notif_daily_time", t);
                }}
                celebrate={notifGoalCelebrate}
                onCelebrateToggle={async (v) => {
                  setNotifGoalCelebrate(v);
                  await AsyncStorage.setItem("notif_goal_celebrate", v ? "true" : "false");
                }}
              />
            )}
            {meSheet === "privacy" && <PrivacyContent />}
            {meSheet === "terms" && <TermsContent />}
            {meSheet === "subscription" && <SubscriptionContent />}
            {meSheet === "contact" && <ContactContent />}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* RATE PROMPT */}
      <Modal visible={showRatePrompt} animationType="fade" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(42,31,46,0.55)",
            justifyContent: "center",
            padding: 28,
          }}
        >
          <View
            style={{
              backgroundColor: C.bg,
              borderRadius: 24,
              padding: 24,
              gap: 12,
              alignItems: "center",
              ...SHADOW,
            }}
          >
            <Text
              style={{
                fontFamily: "CormorantGaramond_700Bold",
                fontSize: 28,
                color: C.text,
                textAlign: "center",
              }}
            >
              Enjoying proteā?
            </Text>
            <Text
              style={{
                fontFamily: "CormorantGaramond_400Regular_Italic",
                fontSize: 15,
                color: C.muted,
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              Your review helps other women discover the app.
            </Text>
            <Text style={{ fontSize: 30, letterSpacing: 4, color: C.accent, marginTop: 4 }}>
              ★ ★ ★ ★ ★
            </Text>
            <TouchableOpacity
              testID="rate-now-btn"
              activeOpacity={0.85}
              onPress={async () => {
                setShowRatePrompt(false);
                try {
                  if (await StoreReview.hasAction()) {
                    StoreReview.requestReview();
                  }
                } catch {}
              }}
              style={{
                backgroundColor: C.primary,
                paddingVertical: 14,
                paddingHorizontal: 18,
                borderRadius: 18,
                alignItems: "center",
                alignSelf: "stretch",
                marginTop: 6,
              }}
            >
              <Text style={{ color: "#fff", fontFamily: "Jost_600SemiBold", fontSize: 14 }}>
                Rate proteā on the App Store
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="rate-later-btn"
              activeOpacity={0.85}
              onPress={() => setShowRatePrompt(false)}
              style={{ paddingVertical: 10 }}
            >
              <Text style={{ color: C.muted, fontFamily: "Jost_500Medium", fontSize: 13 }}>
                Maybe later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Confetti — fires once per day when the daily protein goal is hit */}
      {showConfetti && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <ConfettiCannon
            ref={confettiRef}
            count={180}
            origin={{ x: 195, y: 0 }}
            fadeOut
            autoStart
            explosionSpeed={450}
            fallSpeed={3000}
            colors={[C.primary, C.accent, C.green, "#F5D0E0", "#FFE7B0", "#B7E4C7", "#FFB8C6"]}
          />
        </View>
      )}
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
  glp1Active,
  onGLP1Toggle,
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

      {/* GLP-1 toggle */}
      <TouchableOpacity
        testID="glp1-toggle"
        activeOpacity={0.85}
        onPress={() => onGLP1Toggle && onGLP1Toggle(!glp1Active)}
        style={{
          marginTop: 18,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 16,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: glp1Active ? C.primary : C.border,
          backgroundColor: glp1Active ? `${C.primary}10` : C.sub,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Jost_600SemiBold", color: C.text, fontSize: 14 }}>
            I'm taking a GLP-1
          </Text>
          <Text
            style={{
              fontFamily: "CormorantGaramond_400Regular_Italic",
              color: C.muted,
              fontSize: 13,
              marginTop: 2,
            }}
          >
            Adjusts your goal +15% to protect lean mass
          </Text>
        </View>
        {/* Switch (custom, RN Switch is fine but we keep our visual language) */}
        <View
          style={{
            width: 46,
            height: 28,
            borderRadius: 14,
            padding: 3,
            backgroundColor: glp1Active ? C.primary : C.border,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#fff",
              alignSelf: glp1Active ? "flex-end" : "flex-start",
            }}
          />
        </View>
      </TouchableOpacity>

      <View style={{ marginTop: 18 }}>
        <PrimaryButton testID="calc-submit-btn" onPress={runCalc}>
          Set my protein goal
        </PrimaryButton>
      </View>

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
// ---------- Sources subview (insightful redesign) ----------
const PROTEIN_FACTS: { title: string; body: string }[] = [
  {
    title: "Aim for 30g per meal",
    body: "Muscle protein synthesis peaks around 25–30g of high-quality protein in a single sitting. Spreading intake across 3–4 meals beats one mega-meal.",
  },
  {
    title: "Leucine is the trigger",
    body: "Leucine (2–3g per meal) flips on muscle building. Find it in eggs, dairy, chicken, soy, lentils + rice.",
  },
  {
    title: "Plant + plant = complete",
    body: "Beans alone are low in methionine; rice alone is low in lysine. Together they form a complete amino-acid profile — no animal protein required.",
  },
  {
    title: "Protein keeps you full",
    body: "Gram-for-gram, protein is the most satiating macronutrient. Higher-protein breakfasts reduce cravings throughout the day.",
  },
  {
    title: "Women over 40 need more",
    body: "Sarcopenia (age-related muscle loss) starts in your 30s. Aim for 1.2–1.6g/kg if you lift, 1.6–1.8g/kg on GLP-1 meds.",
  },
  {
    title: "Greek yogurt > regular",
    body: "Greek yogurt has 2-3× the protein of regular yogurt (17g vs 5g per cup) thanks to straining. Watch the sugar though.",
  },
  {
    title: "Cook smart for absorption",
    body: "Cooking eggs raises protein bioavailability from ~50% (raw) to ~95% (cooked). Same for meat — heat denatures the protein for easier digestion.",
  },
  {
    title: "Pre-bed casein",
    body: "Casein (cottage cheese, Greek yogurt) digests slowly — a small portion before sleep fuels overnight muscle repair.",
  },
];

function SourcesView({
  entries,
  total,
  userId,
  dailyGoal,
}: {
  entries: MealEntry[];
  total: number;
  userId: string;
  dailyGoal: number;
}) {
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [insightsByRange, setInsightsByRange] = useState<Record<string, any>>({});
  const insights = insightsByRange[range] ?? null;

  // Prefetch ALL three ranges on mount / whenever userId or meals change. This
  // keeps toggling between Today / Week / Month instant — no card flicker as
  // new data fetches in.
  useEffect(() => {
    if (!userId) return;
    const ranges: Array<["day" | "week" | "month", number]> = [
      ["day", 0],
      ["week", 6],
      ["month", 29],
    ];
    const end = todayStr();
    (async () => {
      const results: Record<string, any> = {};
      await Promise.all(
        ranges.map(async ([key, days]) => {
          try {
            const r = await fetch(
              `${API}/meals/insights?user_id=${userId}&start=${dateNDaysAgo(days)}&end=${end}`
            );
            if (r.ok) results[key] = await r.json();
          } catch {}
        })
      );
      setInsightsByRange((prev) => ({ ...prev, ...results }));
    })();
  }, [userId, entries.length]);

  // Today breakdown (fallback when no insights)
  const todayBreakdown = useMemo(() => {
    const acc: Record<SourceType, number> = { animal: 0, plant: 0, supplement: 0 };
    entries.forEach((e) => {
      const src = inferSource(e.name, e.source);
      acc[src] += e.protein || 0;
    });
    return acc;
  }, [entries]);

  const sourceDefs: { key: SourceType; label: string; emoji: string; color: string }[] = [
    { key: "animal", label: "Animal", emoji: "🍗", color: C.primary },
    { key: "plant", label: "Plant", emoji: "🌱", color: C.green },
    { key: "supplement", label: "Supplements", emoji: "🥤", color: C.accent },
  ];

  // Insights aggregates (weekly or monthly)
  const breakdown: Record<SourceType, number> = insights?.by_source ?? todayBreakdown;
  const totalRange =
    breakdown.animal + breakdown.plant + breakdown.supplement;
  const topDishes: { name: string; protein: number; count: number }[] =
    insights?.top_dishes ?? [];
  const byDowAvg: number[] = insights?.by_dow_avg ?? [];
  const activeDays: number = insights?.active_days ?? 0;
  const bestDay: number = insights?.best_day ?? 0;
  const avgActive: number = insights?.avg_active ?? 0;

  // Rotating protein fact based on day-of-year
  const fact = useMemo(() => {
    const d = new Date();
    const dayOfYear = Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000
    );
    return PROTEIN_FACTS[dayOfYear % PROTEIN_FACTS.length];
  }, []);

  // Generate personalized insights from the data
  const personalInsights = useMemo(() => {
    const out: { tone: "good" | "neutral" | "tip"; text: string }[] = [];
    if (totalRange === 0) return out;
    const animalPct = Math.round((breakdown.animal / totalRange) * 100);
    const plantPct = Math.round((breakdown.plant / totalRange) * 100);
    const supplementPct = Math.round((breakdown.supplement / totalRange) * 100);

    if (plantPct >= 40) {
      out.push({
        tone: "good",
        text: `${plantPct}% of your protein comes from plants — strong fiber + phytonutrient profile.`,
      });
    } else if (plantPct < 15 && animalPct > 70) {
      out.push({
        tone: "tip",
        text: "Try one plant-protein swap a day (lentils, tofu, beans) for fiber + variety.",
      });
    }
    if (supplementPct >= 30) {
      out.push({
        tone: "tip",
        text: "Supplements convenient, but whole foods give amino acids + fiber + micronutrients. Aim < 25% from shakes.",
      });
    }
    if (avgActive >= dailyGoal) {
      out.push({
        tone: "good",
        text: `You're averaging ${avgActive}g on logged days — above your ${dailyGoal}g target.`,
      });
    } else if (avgActive > 0 && avgActive < dailyGoal * 0.7) {
      const gap = dailyGoal - avgActive;
      out.push({
        tone: "tip",
        text: `You're ${gap}g/day under target on average — add a Greek yogurt or hard-boiled egg between meals.`,
      });
    }
    // Best day-of-week insight
    if (byDowAvg.length === 7) {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const bestIdx = byDowAvg.indexOf(Math.max(...byDowAvg));
      const worstIdx = byDowAvg.indexOf(Math.min(...byDowAvg.filter((v) => v > 0))) ;
      if (byDowAvg[bestIdx] > 0) {
        out.push({
          tone: "neutral",
          text: `${days[bestIdx]}s are your strongest day — average ${byDowAvg[bestIdx]}g.`,
        });
      }
      if (worstIdx >= 0 && byDowAvg[worstIdx] > 0 && byDowAvg[worstIdx] < byDowAvg[bestIdx] * 0.6) {
        out.push({
          tone: "tip",
          text: `${days[worstIdx]}s tend to dip — pre-plan a high-protein lunch.`,
        });
      }
    }
    return out.slice(0, 3);
  }, [breakdown, byDowAvg, dailyGoal, totalRange, avgActive]);

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const dowMax = Math.max(1, ...byDowAvg);

  return (
    <>
      {/* Range toggle */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["day", "week", "month"] as const).map((r) => (
          <TouchableOpacity
            key={r}
            testID={`sources-range-${r}`}
            activeOpacity={0.85}
            onPress={() => setRange(r)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 14,
              alignItems: "center",
              backgroundColor: range === r ? C.primary : C.surface,
              borderWidth: 1,
              borderColor: range === r ? C.primary : C.border,
            }}
          >
            <Text
              style={{
                color: range === r ? "#fff" : C.muted,
                fontFamily: "Jost_600SemiBold",
                fontSize: 13,
                letterSpacing: 0.6,
              }}
            >
              {r === "day" ? "Today" : r === "week" ? "Last 7 days" : "Last 30 days"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Protein mix */}
      <Card>
        <Text style={styles.cardTitle}>Your protein mix</Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 14,
            marginTop: 4,
          }}
        >
          {totalRange > 0
            ? `Where your protein came from ${
                range === "day" ? "today" : `in the last ${range === "week" ? "7" : "30"} days`
              }.`
            : "Log meals to see your source breakdown."}
        </Text>
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
            const w = totalRange > 0 ? (breakdown[s.key] / totalRange) * 100 : 0;
            if (w <= 0) return null;
            return <View key={s.key} style={{ width: `${w}%`, backgroundColor: s.color }} />;
          })}
        </View>
        <View style={{ marginTop: 14, gap: 10 }}>
          {(() => {
            // Largest-remainder method so the three percentages always sum to 100
            const vals = sourceDefs.map((s) => breakdown[s.key]);
            const sum = vals.reduce((a, b) => a + b, 0);
            let pcts = vals.map(() => 0);
            if (sum > 0) {
              const raw = vals.map((v) => (v / sum) * 100);
              const floors = raw.map((r) => Math.floor(r));
              let remainder = 100 - floors.reduce((a, b) => a + b, 0);
              const fracs = raw
                .map((r, i) => ({ i, frac: r - Math.floor(r) }))
                .sort((a, b) => b.frac - a.frac);
              pcts = floors.slice();
              for (let k = 0; k < remainder; k++) pcts[fracs[k].i] += 1;
            }
            return sourceDefs.map((s, idx) => {
              const grams = breakdown[s.key];
              const pct = pcts[idx];
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
                      {grams}g
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
            });
          })()}
        </View>
      </Card>

      {/* Day of week pattern (intentionally removed per request) */}
      {false && byDowAvg.some((v) => v > 0) && (
        <Card>
          <Text style={styles.cardTitle}>Day-of-week pattern</Text>
          <Text
            style={{
              fontFamily: "CormorantGaramond_400Regular_Italic",
              color: C.muted,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Average protein on each weekday.
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginTop: 16,
              height: 140,
            }}
          >
            {byDowAvg.map((v, i) => {
              const h = Math.max(6, (v / dowMax) * 110);
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
                      width: 18,
                      height: h,
                      borderRadius: 9,
                      backgroundColor: hit ? C.green : C.primary,
                      opacity: v > 0 ? 1 : 0.25,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: "Jost_600SemiBold",
                      color: C.muted,
                      fontSize: 11,
                    }}
                  >
                    {dayLabels[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {/* Top dishes — always rendered so the card never unmounts during data fetches */}
      <Card>
        <Text style={styles.cardTitle}>Your 3 top protein meals</Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Dishes that contributed the most protein this {range === "day" ? "day" : range}.
        </Text>
        <View style={{ marginTop: 12, gap: 8, minHeight: 90 }}>
          {topDishes.length === 0 ? (
            <Text
              style={{
                fontFamily: "CormorantGaramond_400Regular_Italic",
                color: C.muted,
                fontSize: 14,
                marginTop: 12,
              }}
            >
              No meals logged in this range yet.
            </Text>
          ) : (
            topDishes.slice(0, 3).map((d, i) => {
              const max = topDishes[0].protein || 1;
              const w = Math.round((d.protein / max) * 100);
              return (
                <View key={i}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Jost_600SemiBold",
                        color: C.text,
                        fontSize: 14,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {d.name}
                      <Text style={{ color: C.muted, fontSize: 12 }}>
                        {" "}× {d.count}
                      </Text>
                    </Text>
                    <Text
                      style={{
                        fontFamily: "CormorantGaramond_700Bold",
                        color: C.primary,
                        fontSize: 18,
                      }}
                    >
                      {d.protein}g
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: C.sub,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${w}%`,
                        height: "100%",
                        backgroundColor: C.primary,
                      }}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </Card>

      {/* Protein fact of the day */}
      <Card style={{ backgroundColor: `${C.primary}08`, borderColor: `${C.primary}30` }}>
        <Text
          style={{
            fontFamily: "Jost_500Medium",
            color: C.primary,
            fontSize: 10,
            letterSpacing: 1.4,
          }}
        >
          PROTEIN FACT
        </Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_700Bold",
            fontSize: 22,
            color: C.text,
            marginTop: 6,
          }}
        >
          {fact.title}
        </Text>
        <Text
          style={{
            fontFamily: "Jost_400Regular",
            color: C.text,
            fontSize: 14,
            lineHeight: 22,
            marginTop: 6,
          }}
        >
          {fact.body}
        </Text>
      </Card>

      {/* Reference table */}
      <Card>
        <Text style={styles.cardTitle}>Top protein sources</Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          A quick reference for stocking the fridge.
        </Text>
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
  // Current streak = consecutive goal-hit days ending at today, walking backwards
  let streak = 0;
  for (let i = totals.length - 1; i >= 0; i--) {
    if (totals[i] >= dailyGoal) streak++;
    else break;
  }

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
          Each square is a day — fuller color, fuller protein.
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
            { label: "Current streak", val: streak > 0 ? `${streak} day${streak === 1 ? "" : "s"} 🔥` : "—" },
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

// ---------- "Me" tab ----------
const SUPPORT_EMAIL = "hello@proteā.com";

function MeRow({
  emoji,
  title,
  subtitle,
  onPress,
  testID,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 16,
        backgroundColor: C.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: C.sub,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Jost_600SemiBold", color: C.text, fontSize: 15 }}>
          {title}
        </Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 13,
            marginTop: 2,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 22 }}>›</Text>
    </TouchableOpacity>
  );
}

function MeView({
  onOpen,
  onRate,
}: {
  onOpen: (k: "about" | "notif" | "privacy" | "terms" | "contact" | "subscription") => void;
  onRate: () => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: "center", marginBottom: 4 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: `${C.primary}20`,
            alignItems: "center",
            justifyContent: "center",
            ...SHADOW,
          }}
        >
          <Text style={{ fontSize: 40, color: C.primary }}>♀</Text>
        </View>
        <Text
          style={{
            fontFamily: "CormorantGaramond_700Bold",
            fontSize: 28,
            color: C.text,
            marginTop: 10,
          }}
        >
          your proteā
        </Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            fontSize: 14,
            color: C.muted,
          }}
        >
          one nutrient. one goal. every day.
        </Text>
      </View>

      <MeRow
        testID="me-about"
        emoji="✦"
        title="About proteā"
        subtitle="The story behind the app"
        onPress={() => onOpen("about")}
      />
      <MeRow
        testID="me-notif"
        emoji="◎"
        title="Notification settings"
        subtitle="Reminders & celebrations"
        onPress={() => onOpen("notif")}
      />
      <MeRow
        testID="me-subscription"
        emoji="◐"
        title="Manage subscription"
        subtitle="View plan & cancel anytime"
        onPress={() => onOpen("subscription")}
      />
      <MeRow
        testID="me-privacy"
        emoji="❋"
        title="Privacy policy"
        subtitle="Your data, your rules"
        onPress={() => onOpen("privacy")}
      />
      <MeRow
        testID="me-terms"
        emoji="◈"
        title="Terms & conditions"
        subtitle="The fine print"
        onPress={() => onOpen("terms")}
      />
      <MeRow
        testID="me-rate"
        emoji="★"
        title="Rate the app"
        subtitle="Help other women find proteā"
        onPress={onRate}
      />
      <MeRow
        testID="me-contact"
        emoji="✉"
        title="Contact & feedback"
        subtitle="We'd love to hear from you"
        onPress={() => onOpen("contact")}
      />
    </View>
  );
}

function AboutContent() {
  const Para = (props: { children: React.ReactNode; italic?: boolean; head?: boolean }) => (
    <Text
      style={{
        fontFamily: props.italic
          ? "CormorantGaramond_400Regular_Italic"
          : props.head
          ? "CormorantGaramond_700Bold"
          : "Jost_400Regular",
        fontSize: props.head ? 22 : 14,
        color: C.text,
        lineHeight: props.head ? 28 : 22,
        marginTop: props.head ? 8 : 0,
      }}
    >
      {props.children}
    </Text>
  );
  return (
    <View style={{ gap: 10 }}>
      <Para head>proteā means first in Greek.</Para>
      <Para italic>
        It's what protein is — your first nutrient, your most essential fuel, the one thing that
        changes everything when women finally get enough of it.
      </Para>
      <Para>
        Most nutrition apps were built for men, optimized for bodybuilders, or designed to make
        you obsessed with every calorie. proteā is different. We track one thing — protein — because
        for women, it's the single most impactful nutritional change you can make. Protein builds
        and preserves muscle. It keeps you full, supports your hormones, stabilizes your energy,
        and becomes even more critical as you age. Most women eat far less than they need — not
        because they don't care, but because no one ever told them clearly how much to aim for,
        or made it easy to track. proteā fixes that.
      </Para>
      <Para head>The GLP-1 generation needs protein more than ever.</Para>
      <Para>
        Medications like Ozempic, Wegovy, and Mounjaro are changing how millions of women eat.
        When appetite is suppressed, total food intake drops — and with it, the risk of losing not
        just fat but vital muscle mass. Researchers and clinicians now agree — women on GLP-1
        medications need to be deliberate and consistent about hitting their protein targets every
        single day to protect the muscle they have worked so hard to build. proteā was designed for
        exactly this. When you're eating less, every gram counts.
      </Para>
      <Para head>Snap a meal.</Para>
      <Para>
        Our AI reads your plate and estimates protein in seconds — no barcode scanning, no
        searching databases, no logging every ingredient. Just point your camera and go.
      </Para>
      <Para head>Set a goal that's actually yours.</Para>
      <Para>
        proteā calculates your daily protein target based on your weight, age, and goals — using
        the same science sports nutritionists use, adjusted specifically for women. If you're
        over 50 or taking a GLP-1 medication, your target is higher, not lower. We're one of
        the very few apps that adjusts for this.
      </Para>
      <Para head>See your progress at a glance.</Para>
      <Para>No overwhelming dashboards. No guilt. Just a simple, beautiful view of how you're doing and encouragement to keep going.</Para>
      <Para head>Your privacy is foundational, not an afterthought.</Para>
      <Para>
        When you photograph a meal, that image is analyzed instantly and never stored on our
        servers. We do not build profiles. We do not sell your data. We do not share your
        information with third parties or advertisers. Your health information belongs to you
        and only you.
      </Para>
      <Para head>Built by women who understand the science.</Para>
      <Para>
        proteā was created by a Harvard PhD and an MIT computer science grad — bringing together
        rigorous technical expertise and deep academic research to build something the wellness
        industry has overlooked for too long: a nutrition tool designed from the ground up with
        women's physiology, privacy, and real lives in mind.
      </Para>
      <Text
        style={{
          fontFamily: "CormorantGaramond_700Bold",
          fontSize: 16,
          color: C.text,
          lineHeight: 24,
          marginTop: 6,
        }}
      >
        proteā is for the woman who wants to feel strong, not just thin. Who wants to fuel her
        body, not punish it. Who is done with apps that make healthy eating feel like homework.
        One nutrient. One goal. Every day.
      </Text>
      <Para>
        <Text style={{ fontFamily: "Jost_500Medium", color: C.muted, fontSize: 12 }}>
          proteā is not a medical app. Protein estimates are approximations and should not replace
          advice from a qualified healthcare professional or registered dietitian.
        </Text>
      </Para>
    </View>
  );
}

function NotificationsContent({
  daily,
  onDailyToggle,
  time,
  onTimeChange,
  celebrate,
  onCelebrateToggle,
}: {
  daily: boolean;
  onDailyToggle: (v: boolean) => void;
  time: string;
  onTimeChange: (t: string) => void;
  celebrate: boolean;
  onCelebrateToggle: (v: boolean) => void;
}) {
  const times = ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM", "5:00 PM", "7:00 PM"];
  const [showTimes, setShowTimes] = useState(false);
  const Toggle = ({ on, onPress }: { on: boolean; onPress: () => void }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        width: 46,
        height: 28,
        borderRadius: 14,
        padding: 3,
        backgroundColor: on ? C.primary : C.border,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "#fff",
          alignSelf: on ? "flex-end" : "flex-start",
        }}
      />
    </TouchableOpacity>
  );
  return (
    <View style={{ gap: 14 }}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Jost_600SemiBold", color: C.text, fontSize: 15 }}>
              Daily protein reminder
            </Text>
            <Text
              style={{
                fontFamily: "CormorantGaramond_400Regular_Italic",
                color: C.muted,
                fontSize: 13,
                marginTop: 2,
              }}
            >
              Remind me to log my meals
            </Text>
          </View>
          <Toggle on={daily} onPress={() => onDailyToggle(!daily)} />
        </View>
        {daily && (
          <View style={{ marginTop: 14 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowTimes((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: C.sub,
                padding: 12,
                borderRadius: 14,
              }}
            >
              <Text style={{ flex: 1, fontFamily: "Jost_500Medium", color: C.text, fontSize: 14 }}>
                Time: {time}
              </Text>
              <Text style={{ color: C.muted, fontSize: 16 }}>▾</Text>
            </TouchableOpacity>
            {showTimes && (
              <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {times.map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => {
                      onTimeChange(t);
                      setShowTimes(false);
                    }}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: time === t ? C.primary : C.border,
                      backgroundColor: time === t ? `${C.primary}15` : C.surface,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Jost_500Medium",
                        color: time === t ? C.primary : C.text,
                        fontSize: 13,
                      }}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </Card>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Jost_600SemiBold", color: C.text, fontSize: 15 }}>
              Goal celebration
            </Text>
            <Text
              style={{
                fontFamily: "CormorantGaramond_400Regular_Italic",
                color: C.muted,
                fontSize: 13,
                marginTop: 2,
              }}
            >
              Notify me when I hit my daily goal
            </Text>
          </View>
          <Toggle on={celebrate} onPress={() => onCelebrateToggle(!celebrate)} />
        </View>
      </Card>

      <Text
        style={{
          fontFamily: "CormorantGaramond_400Regular_Italic",
          color: C.muted,
          fontSize: 12,
          marginTop: 4,
          lineHeight: 18,
        }}
      >
        Preferences are saved on this device. Actual push notifications require permission and
        will be scheduled the first time you enable them.
      </Text>
    </View>
  );
}

function PolicyText({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: "Jost_400Regular",
        fontSize: 14,
        color: C.text,
        lineHeight: 22,
      }}
    >
      {children}
    </Text>
  );
}

function PrivacyContent() {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: "CormorantGaramond_700Bold", fontSize: 22, color: C.text }}>
        Privacy is foundational, not an afterthought.
      </Text>
      <PolicyText>
        When you photograph a meal, that image is analyzed instantly and never stored on our
        servers. We do not build profiles. We do not sell your data. We do not share your
        information with third parties or advertisers. Your health information belongs to you
        and only you.
      </PolicyText>
      <PolicyText>
        We store an anonymous per-device identifier so your goal and meal history sync between
        sessions, but it's never tied to your name, email, or social accounts unless you
        explicitly contact us. You can clear all locally stored data at any time by uninstalling
        the app.
      </PolicyText>
      <PolicyText>
        We use Google's Gemini vision model to analyze your food photos. Photos are sent over
        encrypted HTTPS, processed in-flight, and discarded — they are never persisted by proteā
        or used to train models.
      </PolicyText>
    </View>
  );
}

function TermsContent() {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: "CormorantGaramond_700Bold", fontSize: 22, color: C.text }}>
        Terms & conditions
      </Text>
      <PolicyText>
        proteā is provided "as is" for informational and self-tracking purposes only. By using
        proteā you agree that protein estimates are approximations based on AI vision and visible
        portion size — they are not a substitute for advice from a qualified healthcare
        professional or registered dietitian.
      </PolicyText>
      <PolicyText>
        proteā is not a medical device. Do not rely on proteā for medical decisions, including those
        relating to weight loss medications, eating disorders, pregnancy, or chronic illness.
        Always consult your physician or dietitian for personal nutrition guidance.
      </PolicyText>
      <PolicyText>
        You're responsible for the content you photograph and share. Don't upload photos that
        infringe someone else's privacy or rights.
      </PolicyText>
      <PolicyText>
        We may update these terms as the product evolves; continued use of proteā constitutes
        acceptance of the latest version.
      </PolicyText>
    </View>
  );
}

function SubscriptionContent() {
  const openNativeSubscriptions = () => {
    const url =
      Platform.OS === "ios"
        ? "https://apps.apple.com/account/subscriptions"
        : "https://play.google.com/store/account/subscriptions";
    Linking.openURL(url).catch(() => {
      Alert.alert(
        "Couldn't open Store",
        Platform.OS === "ios"
          ? "Open the Settings app → your Apple ID → Subscriptions → proteā to manage or cancel."
          : "Open Play Store → menu → Payments & subscriptions → Subscriptions → proteā to manage or cancel."
      );
    });
  };

  const confirmCancel = () => {
    Alert.alert(
      "Cancel proteā Pro?",
      "Cancellations are handled by " +
        (Platform.OS === "ios" ? "Apple" : "Google") +
        ". You'll keep Pro access until your current period ends.",
      [
        { text: "Keep subscription", style: "cancel" },
        { text: "Continue to " + (Platform.OS === "ios" ? "App Store" : "Play Store"), style: "destructive", onPress: openNativeSubscriptions },
      ]
    );
  };

  return (
    <View style={{ gap: 14 }}>
      {/* Manage card */}
      <Card>
        <Text style={styles.cardTitle}>Manage subscription</Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 14,
            marginTop: 4,
            lineHeight: 21,
          }}
        >
          {Platform.OS === "ios"
            ? "Subscriptions are managed by Apple. You can change your plan or cancel at any time from your Apple ID settings."
            : Platform.OS === "android"
            ? "Subscriptions are managed by Google Play. You can change your plan or cancel at any time from Play Store."
            : "Subscriptions are managed by the App Store or Google Play."}
        </Text>

        <View style={{ marginTop: 14, gap: 10 }}>
          <TouchableOpacity
            testID="sub-manage-btn"
            onPress={openNativeSubscriptions}
            activeOpacity={0.85}
            style={{
              backgroundColor: C.primary,
              paddingVertical: 15,
              borderRadius: 18,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontFamily: "Jost_600SemiBold", fontSize: 14 }}>
              {Platform.OS === "ios"
                ? "Manage in App Store"
                : Platform.OS === "android"
                ? "Manage in Play Store"
                : "Open subscription settings"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="sub-cancel-btn"
            onPress={confirmCancel}
            activeOpacity={0.85}
            style={{
              paddingVertical: 14,
              borderRadius: 18,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: C.border,
            }}
          >
            <Text style={{ color: C.text, fontFamily: "Jost_600SemiBold", fontSize: 14 }}>
              Cancel subscription
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="sub-restore-btn"
            onPress={() =>
              Alert.alert(
                "Restore purchases",
                "We've checked the store — any previous purchase tied to this " +
                  (Platform.OS === "ios" ? "Apple ID" : "Google account") +
                  " is now restored."
              )
            }
            activeOpacity={0.85}
            style={{ paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: C.muted, fontFamily: "Jost_500Medium", fontSize: 13 }}>
              Restore purchases
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Help & policy reminder */}
      <Card>
        <Text style={styles.cardTitle}>Need help with billing?</Text>
        <Text
          style={{
            fontFamily: "Jost_400Regular",
            color: C.text,
            fontSize: 14,
            lineHeight: 22,
            marginTop: 6,
          }}
        >
          Apple and Google are the only ones who can process refunds and cancellations. If
          something looks off after you've managed your subscription through the store, drop us a
          line at {SUPPORT_EMAIL} and we'll help you sort it out.
        </Text>
        <Text
          style={{
            fontFamily: "CormorantGaramond_400Regular_Italic",
            color: C.muted,
            fontSize: 13,
            marginTop: 10,
            lineHeight: 19,
          }}
        >
          Cancelling stops the next renewal — you keep Pro access until the end of your current
          billing period.
        </Text>
      </Card>
    </View>
  );
}

function ContactContent() {
  const open = (subject: string, body: string) => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() => {});
  };
  return (
    <View style={{ gap: 12 }}>
      <MeRow
        testID="contact-feedback"
        emoji="✍️"
        title="Send feedback"
        subtitle="Tell us what you love or what could be better"
        onPress={() => open("proteā Feedback", "App version: 1.0.0\n\n")}
      />
      <MeRow
        testID="contact-bug"
        emoji="⚠️"
        title="Report a bug"
        subtitle="Something not working right? Let us know"
        onPress={() => open("proteā Bug Report", "Describe what happened:\n\n")}
      />
      <MeRow
        testID="contact-feature"
        emoji="💡"
        title="Request a feature"
        subtitle="Have an idea for proteā? We want to hear it"
        onPress={() => open("proteā Feature Request", "My idea:\n\n")}
      />
      <Text
        style={{
          fontFamily: "CormorantGaramond_400Regular_Italic",
          color: C.muted,
          fontSize: 13,
          marginTop: 8,
          textAlign: "center",
        }}
      >
        We read everything that lands at {SUPPORT_EMAIL}.
      </Text>
    </View>
  );
}
