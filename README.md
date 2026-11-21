# Family Board

Panel doméstico para tablet y móvil. La agenda se conecta al calendario
familiar de Google y el despliegue se realiza desde GitHub Actions.
El pie del panel muestra los primeros siete caracteres del commit en producción.

## Desarrollo local

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite sirve una vista local con datos de ejemplo. El Worker desplegado comprueba
la firma, el emisor, la audiencia y la caducidad del JWT de Cloudflare Access
antes de servir la interfaz, los archivos estáticos o la API. El endpoint privado
`/api/status` comprueba la conexión con D1.

## Activación inicial

1. En **Cloudflare → Workers & Pages**, configura un subdominio de cuenta
   `workers.dev`. En **Storage & databases → D1**, crea la base `family-board`.
2. En [Variables de GitHub Actions](https://github.com/ManelPNavarro/family-board/settings/variables/actions),
   crea `D1_DATABASE_ID` con el identificador de la base. En
   [Secretos de GitHub Actions](https://github.com/ManelPNavarro/family-board/settings/secrets/actions),
   guarda `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`. Usa **Account Settings
   → Read** y **Workers Scripts → Edit**, limitados a la cuenta de Family Board.
   Para un Worker ya creado, puedes limitar el permiso de edición a ese Worker.
3. Ejecuta el workflow **Family Board** en `main` desde GitHub Actions. Este
   primer despliegue registra el Worker con la URL y las vistas previas desactivadas.
4. Completa el alta en [Cloudflare Zero Trust Free](https://developers.cloudflare.com/cloudflare-one/setup/).
   Cloudflare solicita un método de pago durante el alta del plan gratuito.
   Activa **One-time PIN** como método de inicio de sesión en Cloudflare Zero
   Trust. En **Workers & Pages → family-board → Access**, protege el Worker con
   **All traffic**. En la aplicación de Access, configura una política **Allow**
   con **Include → Emails** para las direcciones exactas de la familia, selecciona
   **One-time PIN** y ajusta la sesión de aplicación a **7 días**. Ajusta la
   sesión global a **1 mes** desde **Access settings**. La sesión global afecta
   a las aplicaciones de ese equipo de Zero Trust.
5. Copia el nombre de equipo de Zero Trust (la parte anterior a
   `.cloudflareaccess.com`) y la etiqueta **Application Audience (AUD)** de la
   aplicación. Guárdalos en las variables de GitHub Actions `ACCESS_TEAM` y
   `ACCESS_AUD`. Ejecuta de nuevo el workflow. Con ambas variables definidas,
   Wrangler habilita la URL `https://family-board.<subdominio>.workers.dev`.
6. Abre la URL y `/api/status` en una ventana privada. Access debe exigir inicio
   de sesión. Entra con un correo autorizado y comprueba que el panel muestra
   **D1 conectado** y el commit de la ejecución. Los siguientes pushes a
   `main` publican automáticamente si pasan los checks.

Los secretos de futuras integraciones se guardarán en GitHub Actions Secrets y
se cargarán en el Worker en el despliegue. Las llamadas autenticadas a terceros
se harán desde el Worker.

- [Cloudflare Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Duración de las sesiones](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
- [Despliegue de Workers con GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

## Calendario familiar de Google

Family Board lee un único calendario. **Hoy** muestra el día actual y
**Calendario** muestra siete días, incluido hoy. La compra sigue usando datos de ejemplo.

1. En un proyecto de Google Cloud, habilita **Google Calendar API** y crea una
   cuenta de servicio para Family Board. No necesita roles de IAM en el
   proyecto ni delegación del dominio.
2. En Google Calendar, abre **Configuración y uso compartido** del calendario
   familiar. Añade el correo de la cuenta de servicio con permiso **Ver todos
   los detalles de los eventos**. En **Integrar calendario**, copia el ID del
   calendario.
3. Crea una clave JSON para esa cuenta de servicio. Guarda la clave completa
   como `GOOGLE_CALENDAR_SERVICE_ACCOUNT` y el ID del calendario como
   `GOOGLE_CALENDAR_ID` en los
   [secretos de GitHub Actions](https://github.com/ManelPNavarro/family-board/settings/secrets/actions).
4. Ejecuta el workflow **Family Board** en `main`. Abre el panel con tu sesión
   de Access y compara la agenda con el calendario original.

El Worker obtiene un token de corta duración con alcance de solo lectura de
eventos. Devuelve el título y la hora, respeta los eventos privados y no
almacena eventos en D1. Para retirar el acceso a los datos, elimina el permiso
de la cuenta de servicio en Google Calendar o revoca la clave en Google Cloud.
Para limpiar también los dos secretos de ejecución, elimínalos del Worker
además de eliminarlos de GitHub Actions.

- [Compartir un calendario](https://support.google.com/calendar/answer/37082)
- [Crear una cuenta de servicio](https://docs.cloud.google.com/iam/docs/service-accounts-create)
- [Crear una clave JSON](https://docs.cloud.google.com/iam/docs/keys-create-delete)
