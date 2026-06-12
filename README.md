# 🔒 NexusVPN — Simulador de VPN Funcional

Una aplicación de escritorio VPN real construida con **React + Electron + OpenVPN**.
Se conecta a servidores reales de la red voluntaria **VPN Gate** (vpngate.net).

---

## 🚀 Primeros Pasos

### 1. Instalar dependencias del proyecto
```bash
npm install
```

### 2. Instalar OpenVPN (REQUERIDO para conexiones reales)

Ejecuta el script de setup como **Administrador**:
```powershell
# Abre PowerShell como Administrador y ejecuta:
powershell -ExecutionPolicy Bypass -File setup.ps1
```

O descarga manualmente desde: https://openvpn.net/community-downloads/

> ⚠️ Sin OpenVPN instalado, la app funciona pero en **modo simulado** (sin conexión real).

### 3. Iniciar la aplicación en modo desarrollo
```bash
npm run dev
```

---

## 📦 Generar instalador `.exe` para Windows

```bash
npm run dist
```
El instalador se generará en la carpeta `release/`.

---

## 🗂️ Estructura del Proyecto

```
simulador-de-vpn/
├── electron/
│   ├── main.ts         # Proceso principal: descarga VPN Gate, motor OpenVPN
│   └── preload.ts      # Puente seguro frontend ↔ Electron
├── src/
│   └── App.tsx         # Interfaz React completa
├── resources/          # (Opcional) openvpn.exe portable si no está instalado
├── setup.ps1           # Script automático de instalación de OpenVPN
└── package.json
```

---

## ⚙️ Cómo Funciona

| Componente | Tecnología | Función |
|---|---|---|
| Interfaz visual | React + TailwindCSS | Muestra estado, servidores, métricas |
| Motor de ventana | Electron | Convierte la web en app de escritorio |
| Lista de servidores | VPN Gate API | 40 servidores reales ordenados por ping |
| Motor de VPN | OpenVPN CLI | Establece el túnel de red real |

### Flujo de conexión:
1. Al iniciar, descarga automáticamente la lista de servidores de `vpngate.net`
2. El usuario selecciona un país y presiona el botón grande
3. Electron escribe el archivo `.ovpn` del servidor en una carpeta temporal
4. Lanza `openvpn.exe --config archivo.ovpn` en segundo plano (sin ventana)
5. Cuando OpenVPN reporta **"Initialization Sequence Completed"**, la UI cambia a **Connected**
6. Al desconectar, Electron mata el proceso y borra el archivo temporal

---

## 🔒 Notas de Seguridad

- Los archivos `.ovpn` temporales se eliminan automáticamente al desconectar
- La app requiere permisos de Administrador en Windows (necesario para modificar rutas de red)
- VPN Gate es una red voluntaria de investigación académica. Úsala responsablemente.
- **No uses VPN Gate para actividades ilegales.**
