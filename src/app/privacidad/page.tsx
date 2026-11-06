import type { Metadata } from 'next';

const POLICY_URL = 'https://www.importadoracarlitos.cl/privacidad';
const PRIVACY_CONTACT = 'https://wa.me/56985520703';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Política de privacidad de Importadora Carlitos SpA y su tienda online.',
  alternates: { canonical: POLICY_URL },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    title: 'Política de privacidad | Importadora Carlitos',
    description: 'Información sobre el tratamiento de datos personales en la tienda online de Importadora Carlitos.',
    url: POLICY_URL,
  },
};

const sections = [
  {
    title: '1. Quién es responsable de tus datos',
    body: (
      <>
        <p>La responsable es <strong>IMPORTADORA CARLITOS SpA</strong>, RUT <strong>77.862.693-4</strong>, con domicilio en la comuna de Santiago, Región Metropolitana, Chile.</p>
        <p>Esta política cubre la tienda online, sus formularios de compra y el canal de atención de WhatsApp de Importadora Carlitos.</p>
      </>
    ),
  },
  {
    title: '2. Datos que podemos tratar',
    body: (
      <>
        <p>Según cómo uses la tienda, podemos tratar:</p>
        <ul>
          <li>Nombre, RUT, teléfono y correo electrónico que ingreses al crear una cuenta o realizar un pedido.</li>
          <li>Dirección, comuna, región, agencia de despacho e instrucciones necesarias para entregar la compra.</li>
          <li>Productos, cantidades, montos, estado del pedido y comunicaciones relacionadas con la compra.</li>
          <li>Comprobantes de transferencia y archivos que decidas enviar para verificar un pago o solicitar atención.</li>
          <li>Si escribes al bot de WhatsApp <strong>+56 9 5459 2656</strong>, tu número, mensajes, archivos enviados y datos necesarios para responder, revisar pedidos y atender solicitudes.</li>
          <li>Datos técnicos básicos de navegación y almacenamiento local necesarios para funciones como conservar el carrito o la sesión.</li>
        </ul>
        <p>No solicitamos datos de tarjetas bancarias en la tienda. Los pagos se coordinan mediante transferencia bancaria y la validación puede requerir que envíes un comprobante.</p>
      </>
    ),
  },
  {
    title: '3. Para qué usamos los datos',
    body: (
      <ul>
        <li>Crear y administrar cuentas, carritos y pedidos.</li>
        <li>Confirmar disponibilidad, pagos y comprobantes, y coordinar despachos o retiros.</li>
        <li>Responder consultas y enviar avisos relacionados con una compra o una conversación que iniciaste.</li>
        <li>Prevenir errores, fraude y usos no autorizados; mantener y proteger el funcionamiento de la tienda.</li>
        <li>Cumplir obligaciones legales, contables y de atención al consumidor.</li>
      </ul>
    ),
  },
  {
    title: '4. WhatsApp y proveedores tecnológicos',
    body: (
      <>
        <p>Si contactas a Importadora Carlitos por WhatsApp, Meta procesa el mensaje y sus datos de entrega conforme a sus propias condiciones. El bot puede registrar la conversación y los datos del pedido en los sistemas de la tienda para responder y dar seguimiento.</p>
        <p>La tienda usa servicios de Google Firebase para autenticación, base de datos y archivos; Vercel para alojar la aplicación; Meta para el canal de WhatsApp; y agencias de transporte cuando son necesarias para entregar un pedido. Estos proveedores reciben o procesan únicamente los datos necesarios para prestar sus servicios.</p>
        <p>Firestore y Firebase Storage están configurados en la región de Santiago, Chile. Meta y otros proveedores pueden operar infraestructura en distintas ubicaciones conforme a sus políticas y contratos.</p>
      </>
    ),
  },
  {
    title: '5. Publicidad, analítica y almacenamiento del navegador',
    body: (
      <>
        <p>Actualmente la tienda no utiliza Meta Pixel ni Google Analytics.</p>
        <p>El navegador puede guardar información técnica local necesaria para mantener el carrito, la sesión o preferencias básicas. Puedes borrar esos datos desde la configuración de tu navegador; algunas funciones podrían dejar de conservar su estado.</p>
      </>
    ),
  },
  {
    title: '6. Cuánto tiempo conservamos los datos',
    body: (
      <p>Conservamos la información durante el tiempo necesario para gestionar la cuenta, responder la consulta, completar el pedido, resolver asuntos posteriores y cumplir obligaciones legales o contables. Cuando ya no sea necesaria para esos fines, se elimina o se deja de asociar a una persona, salvo que una obligación legal exija conservarla.</p>
    ),
  },
  {
    title: '7. Tus solicitudes de privacidad',
    body: (
      <>
        <p>Puedes solicitar acceso, corrección o eliminación de tus datos, y hacer consultas sobre su uso. Escríbenos al WhatsApp del responsable: <a href={PRIVACY_CONTACT}>+56 9 8552 0703</a>. Para ubicar la información, indica el número de teléfono o correo asociado y el tipo de solicitud; no envíes contraseñas ni datos bancarios completos.</p>
        <p>Antes de entregar o modificar información podremos pedir antecedentes razonables para confirmar tu identidad. Algunas solicitudes pueden estar limitadas cuando debamos conservar información por obligaciones legales, contables o para resolver un pedido pendiente.</p>
      </>
    ),
  },
  {
    title: '8. Seguridad y cambios a esta política',
    body: (
      <>
        <p>Aplicamos medidas técnicas y organizativas para restringir el acceso a la información y protegerla frente a pérdida, uso indebido o acceso no autorizado. Ningún medio de transmisión o almacenamiento puede garantizar seguridad absoluta.</p>
        <p>Podemos actualizar esta política cuando cambien la tienda, sus servicios o las normas aplicables. Publicaremos la versión vigente en esta misma dirección.</p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-10 text-slate-800 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-12">
        <header className="mb-10 border-b border-slate-200 pb-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Importadora Carlitos</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Política de privacidad</h1>
          <p className="mt-3 text-sm text-slate-500">Última actualización: 5 de noviembre de 2026</p>
          <p className="mt-5 max-w-3xl leading-7 text-slate-600">Aquí explicamos qué información se trata cuando visitas la tienda, realizas una compra o conversas con nuestro canal de WhatsApp, para qué la usamos y cómo puedes contactarnos.</p>
        </header>

        <div className="space-y-8 text-[15px] leading-7 text-slate-700 [&_li]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:font-semibold [&_a]:text-blue-700 [&_a]:underline [&_p+p]:mt-3">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 text-lg font-bold text-slate-950">{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>

        <footer className="mt-10 rounded-2xl bg-amber-50 p-5 text-sm leading-6 text-slate-700">
          <p><strong>Contacto para privacidad:</strong> <a className="font-semibold text-blue-700 underline" href={PRIVACY_CONTACT}>WhatsApp +56 9 8552 0703</a></p>
          <p className="mt-1">Canal automatizado de atención y pedidos: WhatsApp +56 9 5459 2656.</p>
          <p className="mt-1">IMPORTADORA CARLITOS SpA · RUT 77.862.693-4 · Santiago, Región Metropolitana, Chile.</p>
        </footer>
      </article>
    </main>
  );
}
