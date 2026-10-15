# Circuito de firmas · Gafial Group

Plataforma web para la **aprobación de diseños mediante circuitos de firmas**.
Es una web estática que se publica gratis en **GitHub Pages**. Los datos compartidos (usuarios, documentos y firmas) se guardan en **Supabase**, que también es gratuito.

## Qué hace

- **Subir diseño a firma** es la acción principal. Al subir se indica:
  - el **código de material** (p. ej. `MA.EST.COL.BEAUTY`),
  - la descripción,
  - el **tipo de documento** (Diseño AAFF, Packaging… o se crea una categoría nueva al momento),
  - el **circuito de firmas**.
- **Versiones automáticas.** Si se vuelve a subir el mismo código de material en el mismo circuito, se guarda como **V2, V3, V4…**. Si la versión anterior seguía en circuito, queda sustituida.
- **Firmas.** Firman todas las personas del circuito, a la vez o en orden, según se configure. Antes y durante la firma, cada persona revisa el documento en el **visor**:
  - zoom con + / − o Ctrl + rueda del ratón,
  - arrastrar para moverse,
  - pantalla completa.
- **Estados:** **En circuito**, **Rechazado** y **Aprobado**. Un rechazo exige comentario.
- **PDF firmado.** Solo se puede descargar cuando han firmado todos. Siempre es un PDF y empieza con una **portada nueva** que contiene:
  - el logo,
  - los datos del documento,
  - el **Cuadro de firmas**: un recuadro por persona con su rol, su firma, su nombre, el OK y la fecha y hora de la firma.
- **Página de inicio:**
  - lo pendiente de tu firma,
  - el último documento aprobado,
  - lo que está en circuito y quién falta,
  - el histórico de firmados.
- **Histórico de aprobados** con buscador (código, producto, persona…) y filtros por tipo, circuito y fechas.
- **Acceso.** Cada persona entra con su **correo y contraseña**. La primera vez crea la contraseña, y la sesión queda recordada en ese equipo. Su **firma** se registra una vez, dibujándola con el cursor o adjuntando una imagen.
- **Configuración abierta a todos los usuarios:** circuitos, tipos de documento, productos, categorías de producto y personas.

Vienen precargados dos circuitos, que se pueden editar:

| Circuito | Firmantes |
|---|---|
| Aprobación de diseños AAFF | respinosa@viteba.com (Graphic designer), aheredia@viteba.com (Product) |
| Aprobación de Dirección | amanas@viteba.com, cbianchi@viteba.com (Executives), ggalimberti@doribac.com (CEO) |

> Revisa en **Usuarios** los nombres, los roles y el correo del CEO. El **rol** de cada firmante es el título de su recuadro en el cuadro de firmas.

---

## 1. Publicar la web en GitHub Pages

1. Crea un repositorio en <https://github.com/new>, por ejemplo `circuito-firmas`.
2. Pulsa **uploading an existing file** y sube **todo el contenido** de esta carpeta, incluidas las carpetas `assets/` y `supabase/` y el archivo `.nojekyll`. Después pulsa **Commit changes**.
3. Ve a **Settings → Pages**, elige **Deploy from a branch**, rama **main** y carpeta **/ (root)**, y pulsa **Save**.
4. En uno o dos minutos la web estará disponible en `https://TU-USUARIO.github.io/circuito-firmas/`.

Sin el paso 2 la web ya funciona, pero en **modo local**: cada navegador guarda sus propios datos. Sirve para probarla, pero no para trabajar en equipo.

## 2. Conectar Supabase para que todos compartan los datos (≈10 minutos)

1. Crea una cuenta en <https://supabase.com> y pulsa **New project**. Elige la región Europa (p. ej. *West EU*) y una contraseña de base de datos.
2. Abre **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**.
3. Ve a **Authentication → Sign In / Providers → Email**:
   - Si **desactivas "Confirm email"**, cada persona entra directamente la primera vez.
   - Si lo dejas activado, la primera vez recibirá un correo de confirmación.
4. Ve a **Authentication → URL Configuration** y pon en **Site URL** la dirección de GitHub Pages del paso 1.
5. En **Project Settings → API** copia la **Project URL** y la clave **anon public**. Pégalas en `config.js`:

   ```js
   supabaseUrl: 'https://xxxxxxxx.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi...',
   ```

   Sube el `config.js` modificado al repositorio. La clave *anon* está pensada para ir en la web: la seguridad la ponen las reglas del paso 2.

A partir de aquí, cada persona abre la web, escribe su correo y elige su contraseña la primera vez.

### Seguridad incluida

- Solo las personas que han iniciado sesión ven datos y documentos.
- Una firma solo la puede registrar la propia persona, con el correo de su sesión.
- Las firmas y el historial **no se pueden modificar ni borrar**.
- Los archivos subidos no se pueden sobrescribir.
- Cada versión guarda su **huella SHA-256**, que también aparece en la portada del PDF.

Si quieres que solo puedan entrar correos de la empresa, en Supabase ve a **Authentication → Sign In / Providers** y desactiva **Allow new users to sign up**. Después da de alta a cada persona en **Authentication → Users → Add user**.

## Avisos por correo

El botón **✉ Avisar a pendientes** abre tu programa de correo con un mensaje preparado y el enlace directo al documento. Los envíos automáticos requerirían un servicio de correo adicional.

## Firma electrónica

Esta plataforma recoge una **firma electrónica simple**. Cada firma queda registrada con:

- la persona autenticada,
- la imagen de su firma,
- la fecha y hora,
- la huella del documento,
- el registro de actividad.

Es adecuada para aprobaciones internas de diseño. No es una firma cualificada eIDAS.

## Archivos

```
index.html            Página
styles.css            Estilos
app.js                Lógica de la aplicación
config.js             Configuración (Supabase y SharePoint)
redirect.html         Página de retorno del inicio de sesión de Microsoft
assets/               Logo e icono de Gafial Group
supabase/schema.sql   Estructura de la base de datos
.nojekyll             Necesario para GitHub Pages
```

Librerías externas, cargadas desde CDN: pdf.js (visor), pdf-lib (generación del PDF firmado) y supabase-js.

---

## Conectar SharePoint (repositorio de documentos)

Con SharePoint activado, los archivos se guardan y se leen desde vuestra biblioteca de SharePoint y se mueven solos entre carpetas según su estado:

```
10.Circuitos de firma/   (sitio VitebaSite)
├── En circuito/<Tipo de documento>/<Código>/      ← esperando firmas (y rechazados)
├── Aprobados/<Tipo de documento>/<Código>/        ← PDF firmado con el cuadro de firmas
│                                   └── Originales/  ← archivo original de esa versión
└── Obsoletos/<Tipo de documento>/<Código>/        ← versiones sustituidas o marcadas como obsoletas
                                    └── Originales/
```

- Al **subir** un documento → `En circuito`.
- Al **aprobarse** (firma la última persona) → se genera el PDF firmado en `Aprobados` y el original pasa a `Aprobados/…/Originales`.
- Al **subir una nueva versión** → la anterior pasa a **Obsoleto** y sus archivos a `Obsoletos`.
- **Marcar como obsoleto / vigente** (menú *Acciones* del documento, cualquier usuario) → mueve los archivos a `Obsoletos` o los devuelve a su carpeta.
- El botón **Descargar PDF firmado** descarga el archivo **desde SharePoint**, así la etiqueta de privacidad de la empresa se aplica en la descarga.

Cada persona conecta su cuenta de Microsoft una vez (botón **Conectar SharePoint** arriba a la derecha). Las operaciones se hacen con sus propios permisos.
Si en algún momento alguien firma sin tener la cuenta conectada, la firma se registra igualmente; los archivos se mueven en cuanto alguien con la cuenta conectada abre la plataforma.

### Lo que tiene que hacer IT (una vez, ~10 minutos)

1. **Microsoft Entra ID → Registros de aplicaciones → Nuevo registro**
   - Nombre: `Circuito de firmas Gafial`
   - Tipos de cuenta: *Solo cuentas de este directorio organizativo*
   - URI de redirección → plataforma **Aplicación de página única (SPA)**:
     `https://vitebamarketing.github.io/gestordocumental/redirect.html`
2. **Permisos de API → Microsoft Graph → Permisos delegados**: `Sites.ReadWrite.All` (y `User.Read`, que viene por defecto) → **Conceder consentimiento de administrador**.
3. Copiar el **Id. de aplicación (cliente)** y el **Id. de directorio (inquilino)** (no son secretos).
4. Crear un grupo **«Circuito de firmas»** con todas las personas de la plataforma y darle permiso de **edición** sobre la carpeta «10.Circuitos de firma» del sitio VitebaSite. Las personas de otro dominio (p. ej. @doribac.com) se incluyen igual; si no son del inquilino, se invitan como invitados.

Después, en `config.js` → bloque `sharepoint`, solo falta rellenar `tenantId` y `clientId`. El sitio (`VitebaSite`) y la carpeta raíz (`rootShareUrl`, enlace a «10.Circuitos de firma») ya están configurados. Los nombres de las subcarpetas también se cambian ahí.

### Etiquetas de privacidad

Si la etiqueta que aplica SharePoint **cifra** el PDF, la plataforma no podría abrirlo para mostrar la vista previa ni para generar la portada de firmas. Por eso `keepBackup: true` guarda además una copia interna (Supabase) que solo se usa si la copia de SharePoint no se puede leer. Las descargas siempre se hacen desde SharePoint.
