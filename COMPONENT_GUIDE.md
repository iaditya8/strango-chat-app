# 🧩 Strango Component Guide

## Overview
This guide details every UI component in Strango, their current styling, and what you can modify. Use this as your reference while redesigning.

---

## 🏠 Landing Page Components

### 1. Landing Container
**HTML:** `<div id="landingPage">`
**Current Style:** Full-screen flex container with glassmorphism card
**Your Options:**
- Change background effects
- Modify card styling
- Adjust layout and spacing
- Update animations

### 2. Landing Card
**HTML:** `<div class="landing-card">`
**Current Style:** Glass panel with blur effect, centered content
**Contains:**
- Logo section
- Title and tagline
- Human verification
- Terms acceptance
- Login options
- Primary CTA button

### 3. Logo Section
**HTML:** `<div class="landing-logo">` + `<img class="logo-image">`
**Current Style:** 80px logo with neon glow animation
**Your Options:**
- Replace logo.svg file
- Change size and positioning
- Modify glow effects
- Update animations

### 4. Title & Tagline
**HTML:** `<h1 class="landing-title">` + `<p class="landing-tagline">`
**Current Style:** Large gradient text with neon colors
**Typography:** Outfit font, 48px title
**Your Options:**
- Change fonts and sizes
- Modify colors and gradients
- Update text effects
- Adjust spacing

### 5. Human Verification
**HTML:** `<div class="human-check">`
**Current Style:** Dashed border box with checkbox
**Contains:** Checkbox + "I am not a robot" text
**Your Options:**
- Redesign verification UI
- Change checkbox styling
- Modify container appearance

### 6. Consent Checkboxes
**HTML:** `<div class="consent-box">` with `<label class="consent-item">`
**Current Style:** Left-aligned checkboxes with hover effects
**Contains:**
- Age verification checkbox
- Terms & privacy checkbox with links
**Your Options:**
- Redesign checkbox appearance
- Modify hover states
- Update link styling

### 7. Login Options
**HTML:** `<div class="login-options">` with `<div class="login-option">`
**Current Style:** Two-column grid with glass panels
**Contains:**
- Session login option (temporary)
- Persistent login option (email-based)
- Input fields for each option
**Your Options:**
- Change layout (grid/stack)
- Redesign option cards
- Modify input styling
- Update active states

---

## 🏢 Main Application Components

### 8. Top Bar
**HTML:** `<header class="topbar">`
**Current Style:** Glass panel with brand and country preview
**Contains:**
- Brand logo and text
- Country flag preview
**Your Options:**
- Redesign navigation bar
- Change brand presentation
- Modify country display
- Update glass effects

### 9. Main Container
**HTML:** `<div class="container">`
**Current Style:** CSS Grid layout (sidebar + main content)
**Responsive:** Stacks on mobile (<900px)
**Your Options:**
- Change grid proportions
- Modify responsive behavior
- Update spacing and gaps

### 10. Filter Sidebar
**HTML:** `<aside class="left-panel card filters-card">`
**Current Style:** Sticky glass panel with form controls
**Contains:**
- Section title
- Name input field
- Country dropdown
- Gender dropdown
- Action buttons
- Status display
**Your Options:**
- Redesign form layout
- Update input styling
- Modify button appearance
- Change sticky behavior

### 11. Form Inputs
**HTML:** Various `<input>` and `<select>` elements
**Current Style:** Glass background with neon focus states
**Types:**
- Text inputs (name)
- Dropdown selects (country, gender)
**Your Options:**
- Redesign input appearance
- Change focus states
- Modify placeholder styling
- Update dropdown design

---

## 💬 Chat Interface Components

### 12. Chat Panel
**HTML:** `<section class="right-panel card">`
**Current Style:** Main glass panel containing chat interface
**Contains:**
- Connection status row
- Chat messages window
- Typing indicator
- Chat input area
- Quick messages
- Safety actions

### 13. Connection Status
**HTML:** `<div class="connection-row">`
**Current Style:** Flex row with status badge and partner name
**Contains:**
- Connection badge (idle/online)
- Partner name display
- Connection quality indicator
**Your Options:**
- Redesign status display
- Change badge styling
- Modify partner name presentation
- Update quality indicators

### 14. Chat Messages Window
**HTML:** `<div id="chatMessages">`
**Current Style:** Scrollable container with glass background
**Contains:**
- Empty state message
- Chat message bubbles
- System messages
**Your Options:**
- Redesign chat container
- Change scrollbar styling
- Modify empty state
- Update background effects

### 15. Message Bubbles
**HTML:** `<div class="chat-message [self|stranger|system]">`
**Current Styles:**
- **Self messages:** Neon gradient bubbles (right-aligned)
- **Stranger messages:** Glass bubbles (left-aligned)
- **System messages:** Purple glass (center-aligned)
**Your Options:**
- Redesign bubble shapes
- Change color schemes
- Modify alignment and spacing
- Update message animations

### 16. Typing Indicator
**HTML:** `<div class="typing-indicator">`
**Current Style:** Glass panel with animated dots
**Animation:** Three bouncing dots
**Your Options:**
- Redesign indicator appearance
- Change animation style
- Modify colors and effects

### 17. Chat Input Area
**HTML:** `<div class="chat-input-area">`
**Current Style:** Flex row with input and send button
**Contains:**
- Text input field
- Send button
**Your Options:**
- Redesign input layout
- Change input styling
- Modify send button
- Update focus states

### 18. Quick Messages
**HTML:** `<div class="quick-messages">` with `<button class="quick-msg">`
**Current Style:** Flex wrap with glass buttons
**Contains:** Pre-defined message buttons
**Your Options:**
- Redesign button layout
- Change button styling
- Modify hover effects
- Update responsive behavior

---

## 🛡️ Safety & Action Components

### 19. Safety Actions
**HTML:** `<div class="safety-actions">`
**Current Style:** Flex row with danger-styled buttons
**Contains:**
- Report button (red theme)
- Block button (red outline)
**Your Options:**
- Redesign safety controls
- Change button styling
- Modify danger color scheme
- Update layout and spacing

### 20. Action Buttons
**HTML:** Various `<button class="btn [primary|secondary|danger]">`
**Current Styles:**
- **Primary:** Neon gradient with glow
- **Secondary:** Glass with border
- **Danger:** Red theme variations
**Your Options:**
- Redesign button system
- Change color schemes
- Modify hover/active states
- Update button sizes and spacing

---

## 🔔 Modal Components

### 21. Modal Overlay
**HTML:** `<div class="modal-overlay">`
**Current Style:** Full-screen backdrop with blur
**Your Options:**
- Change backdrop appearance
- Modify blur effects
- Update animation timing

### 22. Modal Content
**HTML:** `<div class="modal-content">`
**Current Style:** Glass panel with rounded corners
**Contains:**
- Modal header
- Modal body content
- Modal actions
**Your Options:**
- Redesign modal appearance
- Change glass effects
- Modify sizing and positioning
- Update animations

### 23. Rating Modal
**HTML:** Rating-specific modal structure
**Current Style:** Star rating with feedback textarea
**Contains:**
- Star buttons (1-5 rating)
- Comment textarea
- Submit/skip buttons
**Your Options:**
- Redesign rating interface
- Change star styling
- Modify textarea appearance
- Update button layout

### 24. Toast Notifications
**HTML:** `<div class="reconnect-toast">`
**Current Style:** Fixed position glass panel with cyan accent
**Contains:**
- Notification text
- Action buttons (accept/decline)
**Your Options:**
- Redesign notification style
- Change positioning
- Modify action buttons
- Update animations

---

## 🎨 Design System Elements

### 25. Glass Effects
**Current Implementation:**
```css
background: rgba(255, 255, 255, 0.05);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.1);
```
**Your Options:**
- Change opacity levels
- Modify blur intensity
- Update border styling
- Create new glass variants

### 26. Color System
**Current Palette:**
- Primary: #ec4899 (Neon Pink)
- Secondary: #8b5cf6 (Neon Violet)
- Success: #06b6d4 (Cyan)
- Danger: #ef4444 (Red)
- Background: #020617 (Deep Blue)

**Your Options:**
- Create new color palette
- Modify existing colors
- Add new semantic colors
- Update gradient combinations

### 27. Typography Scale
**Current System:**
- Headings: Outfit font family
- Body: Inter font family
- Responsive sizing with CSS clamp()

**Your Options:**
- Choose new font families
- Modify size scales
- Update line heights
- Change font weights

### 28. Spacing System
**Current Scale:**
```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
--space-2xl: 32px;
--space-3xl: 48px;
```

**Your Options:**
- Modify spacing values
- Add new spacing tokens
- Update component spacing
- Change responsive scaling

### 29. Animation System
**Current Timing:**
- Fast: 150ms cubic-bezier(0.4, 0, 0.2, 1)
- Base: 250ms cubic-bezier(0.4, 0, 0.2, 1)
- Slow: 350ms cubic-bezier(0.4, 0, 0.2, 1)

**Your Options:**
- Change timing functions
- Modify animation durations
- Create new animation patterns
- Update micro-interactions

---

## 📱 Responsive Behavior

### Breakpoints
- **Desktop:** 900px+ (full layout)
- **Tablet:** 600px-900px (stacked layout)
- **Mobile:** 380px-600px (mobile optimized)
- **Small Mobile:** <380px (compact layout)

### Key Responsive Changes
1. **Grid Layout:** Sidebar stacks below main content
2. **Typography:** Smaller sizes on mobile
3. **Spacing:** Reduced padding and margins
4. **Touch Targets:** Larger buttons (44px minimum)
5. **Input Fields:** 16px font size (prevents zoom on iOS)

---

## ✅ Testing Checklist

When modifying components, test:
- [ ] Visual appearance matches design
- [ ] Hover states work correctly
- [ ] Focus states are visible
- [ ] Animations are smooth
- [ ] Mobile responsive behavior
- [ ] Touch interactions work
- [ ] Accessibility is maintained
- [ ] Performance is good
- [ ] Cross-browser compatibility

---

## 🎯 Component Priority

**High Priority (Core UX):**
1. Chat message bubbles
2. Action buttons
3. Form inputs
4. Modal dialogs

**Medium Priority (Visual Polish):**
1. Landing page design
2. Navigation bar
3. Status indicators
4. Animations

**Low Priority (Nice to Have):**
1. Background effects
2. Advanced animations
3. Decorative elements
4. Easter eggs

Use this guide as your roadmap for redesigning Strango's interface! 🚀