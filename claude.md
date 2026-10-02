# CLAUDE.md - Mobile Quotation Web App ("Cotizador Móvil")

This document serves as the master specification, architecture blueprint, command reference, and design guide for Claude Code to implement the mobile quotation web application.

---

## 1. Project Overview & Architecture

### Core Purpose
A mobile-first web application designed for on-the-go quotation generation. Built for three specific sales representatives:
- **Roberto**
- **Damian**
- **Antonio**

Each quote includes dynamic product configurations, predictive autocomplete from historically saved products, live table previews, PDF export, cloud persistence, and strict per-user quote history isolation.

### Technical Stack
- **Build Tool & Framework**: [Vite](https://vitejs.dev/) + **React 18** with **TypeScript**
- **Styling**: **Tailwind CSS** + **Tailwind Merge** + **Lucide React** (icons)
- **Database & Sync**: **Firebase Firestore** (Modular Web SDK v10)
  - Real-time cloud sync across mobile devices and desktops
  - Offline persistence enabled via Firestore IndexedDB cache
- **PDF Generation**: Client-side with `jspdf` + `jspdf-autotable` (fast, reliable on mobile, with Web Share API support)
- **Design System Scale**: Built following **Taste-Skill** anti-slop frontend guidelines ([taste-skill](https://github.com/Leonxlnx/taste-skill))

---

## 2. Design Scale & Aesthetics (Taste-Skill System)

Adhere to the [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) principles to prevent generic AI UI slop:

### Taste-Skill Dial Settings:
1. **Design Variance Dial**: `Moderate-Refined` (clean, purpose-driven, zero unnecessary fluff or cluttered gradients).
2. **Motion Intensity Dial**: `Subtle` (150ms–200ms ease-out transitions for bottom sheets, tabs, and button presses; no bouncy cartoonish animations).
3. **Visual Density Dial**: `High Mobile Efficiency`
   - Form inputs and clickable items must strictly meet mobile ergonomics: minimum 44px–48px touch targets.
   - Quotation preview table: compact, legible rows with alternating contrast or clean dividers for fast scanning.
4. **Shape Consistency Lock**:
   - Use the **Soft Scale** consistently across the entire app:
     - Cards and containers: `rounded-2xl` (16px)
     - Input fields, selectors, and buttons: `rounded-xl` (12px)
     - Badges and status pills: `rounded-full` (9999px)
     - Avoid mixing square, sharp corners with pill shapes arbitrarily.
5. **Color & Contrast Discipline (Dark Mode Strictly Enforced)**:
   - **Theme Requirement**: The application, quotation builder, and live preview MUST be built in **Dark Mode by default** (not white).
   - Surface colors: Sleek deep zinc / obsidian dark mode (`bg-zinc-950` main background, `bg-zinc-900` card surfaces, `border-zinc-800` subtle borders).
   - Brand Accent: Car Store red (`#dc2626` / `#ef4444`) inspired by the red heartbeat line and wheel hub in the company logo, combined with high-contrast crisp white typography (`text-zinc-100` / `text-white`).
   - Avoid generic AI neon purple gradients or washed-out low-contrast gray text.
   - Quotation Preview Table: Dark-themed table with sleek borders and high-legibility contrasting cells.

---

## 3. Database Schema (Firebase Firestore)

### Collection: `products`
Stores products dynamically added during quotations to provide predictive autocomplete and last-used prices.
```typescript
interface Product {
  id: string;              // Auto-generated Firestore ID
  type: string;            // e.g. "Celular", "Notebook", "Accesorio"
  brand: string;           // e.g. "Apple", "Samsung", "Xiaomi"
  model: string;           // e.g. "iPhone 15 Pro 128GB", "Galaxy S24"
  lastPrice: number;       // Last suggested or added unit price
  updatedAt: Timestamp;    // Last quotation date
  createdByUser: string;   // "roberto" | "damian" | "antonio"
  searchKey: string;       // Lowercase concatenated string for indexed search
}
```

### Collection: `quotes`
Stores completed or saved quotations.
```typescript
interface QuoteItem {
  id: string;
  type: string;
  brand: string;
  model: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Quote {
  id: string;              // Firestore document ID
  quoteNumber: string;     // Formatted sequential number (e.g., "COT-2026-0042")
  userId: "roberto" | "damian" | "antonio";
  userName: "Roberto" | "Damian" | "Antonio";
  createdAt: Timestamp;
  status: "saved" | "exported";
  items: QuoteItem[];
  totalAmount: number;
  notes?: string;
  // Snapshot of company identity at creation time
  companyInfo: {
    brandName: string;
    logoUrl: string;
    phone: string;
    address: string;
    email: string;
    instagram: string;
    website: string;
  };
}
```

### Collection: `app_config` (Default Profile: Car Store Belgrano)
Global configuration document (`id: "company"`):
```typescript
interface CompanyConfig {
  brandName: string;    // "Car Store Belgrano"
  logoUrl: string;      // "/logo.png" (source: D:\Escritorio\Oddi\carstore\fotos\Logo.png)
  phone: string;        // "(011) 4783-1414"
  whatsapp: string;     // "(011) 6447-2550"
  address: string;      // "11 de Septiembre de 1888 2739, Belgrano, CABA"
  email: string;        // "info@carstore.com.ar"
  instagram: string;    // "@carstorebelgrano" (https://instagram.com/carstorebelgrano)
  website: string;      // "www.carstorebelgrano.com"
  quoteSequence: number;// Incremented for quote number generation
}
```

> **Company Details & Logo Reference**:
> - **Source Logo Path**: `D:\Escritorio\Oddi\carstore\fotos\Logo.png`
> - **Domain/Specialty**: Car Audio, Multimedia (Apple CarPlay / Android Auto), Polarizados & Láminas de Seguridad 3M, Car Detailing, Iluminación LED.
> - **Theme Styling**: Dark mode by default (`bg-zinc-950`), matching the white outline logo with red heartbeat accent (`#dc2626`).

---

## 4. Language & Localization (Strict Spanish UI)

> **CRITICAL RULE**: The instructions, architecture, and code comments in this document and repository are in English. However, **100% of the mobile web app's user interface, buttons, inputs, alerts, preview tables, and exported PDF documents MUST be in Spanish**.

### Standardized Spanish UI Vocabulary:
- **Profile / Login Screen**:
  - Title: *"¿Quién está cotizando hoy?"* / *"Seleccionar Usuario"*
  - Users: `Roberto`, `Damian`, `Antonio`
- **Quotation Form & Fields**:
  - `Tipo` (e.g. *Celular, Computadora, Accesorio, Repuesto*)
  - `Marca` (e.g. *Apple, Samsung, Motorola, Xiaomi*)
  - `Modelo` (e.g. *iPhone 15 Pro 128GB, Galaxy S24 Ultra*)
  - `Cantidad` (Units counter)
  - `Precio Unitario` (Defaults to 0 or last recorded price)
  - `Subtotal` & `Total`
  - Action button: *"Agregar Producto a la Cotización"*
  - Dynamic field toggle labels: *"Activar/Desactivar campo (Tipo, Marca, Modelo, Precio)"*
- **Live Table Preview & PDF Document**:
  - Document Title: *"COTIZACIÓN"*
  - Document Number: *"Cotización N°: [COT-YYYYMMDD-XXXX]"*
  - Date: *"Fecha: DD/MM/AAAA"*
  - Author Badge: *"Cotizado por: [Roberto / Damian / Antonio]"*
  - Table Headers: `Cant.` | `Descripción (Tipo / Marca / Modelo)` | `P. Unitario` | `Subtotal`
  - Summary: *"Total Cotización: $X.XXX"*
  - Contact Labels: *"Teléfono"*, *"Dirección"*, *"Correo Electrónico"*, *"Instagram"*, *"Sitio Web"*
- **Primary Actions**:
  - *"Guardar Cotización"* (Saves without downloading)
  - *"Exportar PDF"* (Generates PDF & triggers download or mobile share)
  - *"Nueva Cotización"*
  - *"Limpiar Formulario"*
- **Navigation & Hamburger Menu**:
  - Drawer Title: *"Menú Principal"*
  - *"Nueva Cotización"*
  - *"Historial de Cotizaciones"*
  - *"Configuración de Empresa"* (Logo y Datos de Contacto)
  - *"Cambiar Usuario"*
- **Notifications & Empty States**:
  - *"Cotización guardada con éxito"*
  - *"PDF generado correctamente"*
  - *"No hay productos agregados todavía"*
  - *"No tienes cotizaciones registradas en tu historial"*

---

## 5. Key Functional Requirements

1. **User Selection Screen**:
   - Screen displayed upon entering the app with 3 avatar cards: **Roberto**, **Damian**, and **Antonio**.
   - Selected user is saved in `localStorage` for session persistence with a quick "Cambiar Usuario" option in the header.
2. **Quotation History Isolation**:
   - Each user can **only view their own quotations**.
   - Firestore query filtered by: `where("userId", "==", activeUser.id)`.
3. **Dynamic Quotation Builder**:
   - Inputs for: `Tipo`, `Marca`, `Modelo`, `Cantidad`, `Precio Unitario`.
   - Ability to add or remove options (e.g., toggle model, toggle type if not applicable).
   - Price defaults to `0` or the `lastPrice` found for the matching model in the `products` database.
   - Predictive autocomplete: As the user types in `Tipo`, `Marca`, or `Modelo`, suggestions appear from the existing product database.
   - Automatically upserts product to the `products` collection upon adding to quote.
4. **Live Table Preview**:
   - Renders below the builder in table format showing:
     - Brand logo & Contact details header.
     - Columns: `Cant.` | `Descripción (Tipo / Marca / Modelo)` | `P. Unitario` | `Subtotal`.
     - Total calculation.
     - Author label: *"Cotizado por: [Nombre del Usuario]"*.
5. **Export & Save**:
   - Button to **"Guardar Cotización"** (saves to Firestore without exporting).
   - Button to **"Exportar PDF"** (generates clean PDF, triggers mobile download or native share sheet, and marks quote as exported).
6. **Navigation & Hamburger Menu**:
   - Hamburger drawer containing:
     - Current Active User badge
     - *"Nueva Cotización"*
     - *"Historial de Cotizaciones"* (filtered by user)
     - *"Configuración de Empresa"* (Logo & Contact info)
     - *"Cambiar Usuario"*

---

## 6. CLI & Execution Commands

### A. Project Initialization
```bash
# 1. Create Vite React TypeScript application
npm create vite@latest cotizador -- --template react-ts

# 2. Enter project directory
cd cotizador

# 3. Install core dependencies
npm install firebase lucide-react jspdf jspdf-autotable clsx tailwind-merge

# 4. Install Tailwind CSS and PostCSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### B. Development & Build Commands
```bash
# Start local development server with hot-reload
npm run dev

# Run TypeScript type-checking
npx tsc --noEmit

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

### C. Firebase Setup Commands
```bash
# Install Firebase CLI globally (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firestore and Hosting
firebase init firestore
firebase init hosting
```

---

## 7. Project Structure

```
cotizador/
├── public/
│   ├── logo.svg
│   └── favicon.ico
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx           # App bar with user badge & hamburger trigger
│   │   │   ├── NavigationDrawer.tsx # Mobile slide-out drawer
│   │   │   └── UserSelector.tsx     # Roberto / Damian / Antonio avatar picker
│   │   ├── quote/
│   │   │   ├── QuoteBuilder.tsx     # Main quote form with dynamic fields
│   │   │   ├── AutocompleteInput.tsx# Predictive text suggestion dropdown
│   │   │   ├── QuoteTablePreview.tsx# Live table preview with totals
│   │   │   └── DynamicOptionToggles.tsx # Add/remove field toggles
│   │   ├── history/
│   │   │   ├── QuoteHistoryList.tsx # User-isolated list of quotes
│   │   │   └── QuoteDetailModal.tsx # View past quote and re-export PDF
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       └── Input.tsx
│   ├── context/
│   │   └── UserContext.tsx          # Current active user state & persistence
│   ├── services/
│   │   ├── firebase.ts              # Firebase app & Firestore initialization
│   │   ├── productService.ts        # Product autocomplete & upsert queries
│   │   ├── quoteService.ts          # Quote CRUD & number generator
│   │   └── pdfGenerator.ts          # jsPDF quotation layout generator
│   ├── types/
│   │   └── index.ts                 # Product, Quote, User, Company types
│   ├── App.tsx                      # Main view routing / screen switcher
│   ├── main.tsx
│   └── index.css                    # Tailwind directives & Taste-Skill theme
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── package.json
```

---

## 8. Current Status & Next Phase: Firebase Firestore Migration

### Status: Frontend UI Complete & Verified
- Vite + React + TypeScript + Tailwind CSS running at `http://localhost:5173`.
- Tested in mobile viewport (375px) with all UI strings in Spanish.
- Clean service layer architecture in `src/services/` (`quoteService.ts`, `productService.ts`, `companyService.ts`).
- PDF generation with `jspdf` and Web Share API verified.
- User switching (Roberto, Damian, Antonio) and quote history isolation verified.

### Next Step: Backend Migration to Firebase Firestore
All UI components talk exclusively to asynchronous service files in `src/services/`. The migration only requires:
1. **Initialize Firebase SDK**:
   - Create `src/services/firebase.ts` using `.env.local` keys (Project ID: `carstore-5b1b1`).
   - Enable `persistentLocalCache` with `persistentMultipleTabManager` for robust mobile offline usage.
2. **Company Profile & Logo**:
   - Copy `D:\Escritorio\Oddi\carstore\fotos\Logo.png` -> `public/logo.png`.
   - Update `companyService.ts` default document to **Car Store Belgrano** (11 de Septiembre 2739, CABA).
   - Use a Firestore transaction (`runTransaction`) on `app_config/company` to atomically generate sequential quote numbers (`quoteSequence + 1`).
3. **Product Catalog & Predictive Autocomplete**:
   - Rewrite `productService.ts` to query the Firestore `products` collection (`getDocs`, `query`, `where`).
   - Seed automotive products (3M tinting, Apple CarPlay stereos, speakers, subwoofers, ceramic detailing) if empty.
   - Upsert products on quote creation to maintain last-suggested prices.
4. **Quotation Persistence & Isolation**:
   - Rewrite `quoteService.ts` to save quotes in `quotes` collection.
   - Filter history strictly with `where("userId", "==", userId)` and order by `createdAt desc`.
   - Convert Firestore `Timestamp` to/from formatted dates.
