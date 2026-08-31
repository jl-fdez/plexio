# 🚀 Guía de Despliegue de Plexio en VPS

Esta guía contiene las instrucciones paso a paso para desplegar **Plexio** en un servidor VPS (Ubuntu / Debian) utilizando **Docker Compose**, **Caddy** (con certificados HTTPS/SSL automáticos) y **persistencia de datos**.

---

## 📋 Requisitos Previos

1. **VPS con Linux** (Ubuntu 22.04/24.04 recomendado).
2. **Puertos Abiertos en el Firewall**: `80` (HTTP) y `443` (HTTPS).
3. **Dominio o Subdominio**: Un registro DNS tipo `A` apuntando a la IP pública de tu VPS (por ejemplo: `plexio.tudominio.com`).

---

## 🛠️ Paso 1: Instalar Docker en el VPS

Conéctate a tu VPS mediante SSH:

```bash
ssh usuario@IP_DE_TU_VPS
```

Ejecuta el script oficial de instalación de Docker:

```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Permitir ejecutar docker sin sudo (opcional)
sudo usermod -aG docker $USER
newgrp docker
```

---

## 📦 Paso 2: Clonar o Subir el Proyecto

Clona tu repositorio en el directorio deseado (ej. `/opt/plexio`):

```bash
sudo mkdir -p /opt/plexio
sudo chown -R $USER:$USER /opt/plexio
git clone <URL_DE_TU_REPOSITORIO> /opt/plexio
cd /opt/plexio
```

*(Alternativamente, puedes transferir los archivos desde tu máquina local usando `rsync` o `scp`).*

---

## ⚙️ Paso 3: Configurar las Variables de Entorno

Copia la plantilla de producción y edítala:

```bash
cp .env.production.example .env
nano .env
```

Configura principalmente:
1. `DOMAIN`: Pon tu dominio o subdominio real (ej. `plexio.tudominio.com`).
2. `HTTP_PORT` / `HTTPS_PORT`: Modifícalos si el puerto 80 o 443 ya están ocupados en tu VPS (ej. `HTTP_PORT=8080`, `HTTPS_PORT=8443`).
3. `PORT`: Si prefieres exponer Plexio directamente sin el proxy Caddy (ej. `PORT=7777`).
4. `JWT_SECRET_KEY`: Genera una clave aleatoria segura ejecutando `openssl rand -hex 32` y pégala aquí.


Guarda los cambios con `Ctrl + O`, `Enter` y sal con `Ctrl + X`.

---

## 🚢 Paso 4: Desplegar la Aplicación

Construye las imágenes e inicia los servicios en segundo plano:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 🔍 Paso 5: Verificar el Estado y Logs

Para verificar que todos los contenedores están corriendo:

```bash
docker compose -f docker-compose.prod.yml ps
```

Para ver los registros en tiempo real:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

*(Caddy obtendrá automáticamente el certificado SSL Let's Encrypt en cuestión de segundos).*

---

## 🌐 Paso 6: Acceso y Uso

- **Panel de Administración**: Abre en tu navegador `https://plexio.tudominio.com/admin`
- **Configuración de Stremio**: Configura tu cuenta e instala el addon en Stremio copiando el enlace del manifiesto que te proporciona el panel.

---

## 🔄 Mantenimiento y Actualizaciones

Para actualizar la app a una nueva versión:

```bash
cd /opt/plexio
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Copia de Seguridad de la Base de Datos
La base de datos SQLite se almacena en el volumen `plexio-data`. Para respaldarla:

```bash
docker compose -f docker-compose.prod.yml exec plexio cp /app/data/plexio.db /app/data/backup_$(date +%F).db
```
