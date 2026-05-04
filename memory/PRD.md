# nuura — Protein Tracking App

## Overview
A women-focused, science-backed protein tracking mobile app (Expo). Users snap food photos with their phone, AI estimates protein content, and the app tracks daily / weekly / monthly progress vs a personalised daily goal calculated from weight, age, and fitness goal.

## Tech Stack
- Frontend: Expo Router (React Native, TS), AsyncStorage, expo-image-picker, react-native-svg, Cormorant Garamond + Jost fonts
- Backend: FastAPI + Motor (MongoDB)
- AI: Gemini 2.5 Flash via emergentintegrations (Emergent Universal LLM Key)

## Key Features
- **Onboarding flow** on first launch — collects weight (lbs/kg), age, fitness goal (maintain / lose / build / active) and computes personalised daily protein target
- **Snap a meal** — uses camera (or photo library upload) to capture food, sends base64 to backend, Gemini Vision returns `{name, protein, note}`; meal is logged
- **Today view** — animated SVG progress ring, remaining/over-goal status, list of today's meals with photos & notes
- **My Goal (calculator)** — re-run the personalised protein calculation any time (ISSN/ACSM-based formulas, 50+ adjustment)
- **Sources** — top high-protein foods reference
- **Week** — last 7 days bar chart + avg / best / goals-hit summary
- **Month** — last 30-day heatmap calendar grid + monthly summary stats

## Backend API (`/api`)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Health check |
| POST | `/analyze` | Body `{imageBase64, user_id?}` → `{name, protein, emoji, note}` (Gemini 2.5 Flash vision) |
| POST | `/profile` | Upsert user profile (weight, age, goal, dailyGoal) |
| GET | `/profile/{user_id}` | Get profile or null |
| POST | `/meals` | Log a meal |
| GET | `/meals?user_id&date` | List meals for a date |
| GET | `/meals/range?user_id&start&end` | Aggregated daily protein totals |
| DELETE | `/meals/{id}?user_id` | Remove a meal |

## Persistence
- MongoDB collections: `profiles`, `meals` (also offline-cached locally via AsyncStorage)
- Anonymous per-device user_id stored in AsyncStorage (`nuura_user_id`)

## Env Vars
- Backend `.env`: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`
- Frontend `.env`: `EXPO_PUBLIC_BACKEND_URL`

## Permissions
- iOS: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`
- Android: `android.permission.CAMERA`, `READ_EXTERNAL_STORAGE`

## Smart Enhancement (revenue/retention)
The Month heatmap creates strong streak psychology (visible green days) — a proven retention driver. Future opportunity: `Pro` tier adds AI meal coaching using same Gemini key (gross-margin friendly via Emergent Universal Key).
