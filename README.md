# Watch Doctor (ERPNext v15)

Custom watch repair management app. Frontend is a React/Vite SPA that proxies to ERPNext when `window.frappe` is available, and falls back to mock data when used standalone.

## Frontend (React)
- `cd frontend`
- `npm install`
- `npm run dev` (proxies `/app|/api|/assets|/files|/private` to `http://127.0.0.1:8000`)
- `npm run build` (outputs to `watch_doctor/public/frontend` so Bench can serve `/assets/watch_doctor/frontend/...`)

Open the app at `/repair` on your site once built.

## Backend
- Doctypes are prefixed with `DW`: `DW Repair Order` (parent) with children `DW Repair Item`, `DW Repair Task`, and `DW Repair Part Used`.
- Install on your site as usual: `bench --site <yoursite> install-app watch_doctor` then `bench --site <yoursite> migrate`.
