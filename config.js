/* =====================================================================
   CONFIGURACIÓN
   - Sin Supabase: la app funciona en "modo local" (datos solo en ese navegador).
   - Con Supabase: cada persona entra con su correo y contraseña desde
     cualquier equipo y todos ven los mismos documentos y firmas.
     Pega aquí la "Project URL" y la "anon public key" de tu proyecto
     (Supabase → Project Settings → API). Ver README.md.
   ===================================================================== */
window.APP_CONFIG = {
  appName: 'Circuito de firmas · Gafial Group',
  company: 'Gafial Group',
  supabaseUrl: 'https://bazyaktqolapgjommuba.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhenlha3Rxb2xhcGdqb21tdWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODAyMzYsImV4cCI6MjEwNzU1NjIzNn0.XkoVbuo6P2oEw-TRCHxqcrLbVl5EB9XfaT82rFk6e3U',

  /* ---------------------------------------------------------------------
     SHAREPOINT (ver README → «Conectar SharePoint»)
     Para activarlo: enabled: true y rellenar tenantId, clientId y siteUrl.
     --------------------------------------------------------------------- */
  sharepoint: {
    enabled: true,                // se activa en cuanto se rellenan tenantId y clientId
    tenantId: '',                 // ID de directorio (inquilino) de Microsoft Entra
    clientId: '',                 // ID de aplicación (cliente) registrada por IT
    siteUrl: 'https://gafial.sharepoint.com/sites/VitebaSite',
    // Carpeta raíz: «10.Circuitos de firma» (enlace de SharePoint a la carpeta)
    rootShareUrl: 'https://gafial.sharepoint.com/:f:/s/VitebaSite/IgDHxzXRTmi_RLIdlL9il88gAayb_aZo-T90-I39KoJ0mu8?e=ZCwMzt',
    folders: {
      circuit: 'En circuito',     // documentos esperando firmas (y rechazados)
      approved: 'Aprobados',      // PDF firmado con el cuadro de firmas
      obsolete: 'Obsoletos',      // versiones sustituidas o marcadas como obsoletas
      originals: 'Originales',    // subcarpeta con el archivo original de cada versión aprobada u obsoleta
    },
    keepBackup: true,             // guarda además una copia interna en Supabase por seguridad
  },
};
