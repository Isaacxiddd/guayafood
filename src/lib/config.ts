export const SITE = {
  title: 'Guayafood',
  tagline: 'Comida venezolana casera',
  description: 'Guayafood - Comida venezolana casera en Buenos Aires. Empanaditas, tequeños y pastelitos andinos hechos con amor por una mamá venezolana.',
  shortDescription: 'Desde mi cocina, para tu corazón. Comida venezolana casera en Buenos Aires.',
  keywords: 'comida venezolana, Buenos Aires, empanadas, tequeños, pastelitos andinos, venezolano',
  url: 'https://guayafood.vercel.app',
  ogTitle: 'Guayafood | Comida venezolana casera',
  ogDescription: 'Desde mi cocina, para tu corazón. Comida venezolana casera en Buenos Aires.',
  year: 2025,
  location: 'Buenos Aires, Argentina',
  instagram: '@guayafood.ba',
  instagramUrl: 'https://instagram.com/guayafood.ba',
};

export const WHATSAPP = {
  number: '5491123861180',
  get url() {
    return `https://wa.me/${this.number}`;
  },
  messages: {
    general: "Hola! Quiero hacer un pedido de Guayafood 🥟",
    productos: "Hola! Quiero encargar productos de Guayafood 🥟",
    combos: "Hola! Quiero encargar un combo de Guayafood 🎉",
  },
  message(text: string) {
    return `https://wa.me/${this.number}?text=${encodeURIComponent(text)}`;
  },
};

export const NAV = [
  { label: 'Productos', href: '#productos' },
  { label: 'Combos', href: '#combos' },
  { label: 'Galería', href: '#galeria' },
  { label: 'Cómo pedir', href: '#como-pedir' },
];

export const HERO = {
  badge: 'COCINA VENEZOLANA EN BUENOS AIRES',
  heading: 'Desde mi cocina,',
  headingHighlight: 'para tu corazón',
  description: 'Empanaditas, tequeños y pastelitos andinos hechos con la receta tradicional de una mamá venezolana. Todo casero, todo con cariño.',
  cta: 'Hacé tu pedido',
  secondaryCta: 'Ver productos',
};

export const HISTORIA = {
  badge: 'Nuestra historia',
  title: 'Una receta con historia',
  paragraphs: [
    'Guayafood nace en la cocina de una casa en Buenos Aires, donde una mamá venezolana sigue preparando las mismas recetas que aprendió de su abuela. Las mismas empanaditas, los mismos tequeños, el mismo amor en cada detalle.',
    'Cada pedido se prepara desde cero, con ingredientes frescos y el toque secreto que solo una mamá venezolana conoce. Porque la comida hecha con cariño siempre sabe mejor.',
  ],
  quote: '"Porque los mejores momentos se disfrutan con buena comida y buena compañía"',
  cta: 'Conocé nuestro menú',
};

export const PRODUCTOS_SECTION = {
  badge: 'Nuestros productos',
  title: 'Hechos con amor, como en casa',
  description: 'Cada bocado te transporta a una cocina venezolana. Productos caseros, preparados en el día.',
  items: [
    {
      name: 'Empanaditas venezolanas',
      description: 'Rellenas del sabor que nos representa. Carne mechada, carne molida, pollo, queso, jamón y queso, mondongo, salchicha, salchipollo.',
      price: '$1.500 c/u',
      unitPrice: 1500,
      emoji: '🥟',
    },
    {
      name: 'Tequeños irresistibles',
      description: 'Crujientes por fuera, queso derretido por dentro. El clásico que nunca falla en ninguna reunión.',
      price: '$1.000 c/u',
      unitPrice: 1000,
      emoji: '🧀',
    },
    {
      name: 'Pastelitos andinos',
      description: 'Crujientes por fuera, deliciosos por dentro. Rellenos de carne, pollo o queso. Un bocado que enamora.',
      price: '$1.800 c/u',
      unitPrice: 1800,
      emoji: '🥟',
    },
  ],
  extras: '🥗 Acompañamientos: Salsa de ajo · Salsa guasacaca',
};

export const COMBOS_SECTION = {
  badge: 'Combos',
  title: 'Perfectos para compartir',
  description: 'Ideal para reuniones, cumpleaños, eventos y más. Delivery con costo adicional.',
  items: [
    { id: 'A', name: 'Combo A', pieces: '10 piezas', salsas: '1 salsa a elección', price: '$10.000', unitPrice: 10000, popular: false },
    { id: 'B', name: 'Combo B', pieces: '15 piezas', salsas: '1 salsa a elección', price: '$14.500', unitPrice: 14500, popular: true },
    { id: 'C', name: 'Combo C', pieces: '20 piezas', salsas: '2 salsas a elección', price: '$18.000', unitPrice: 18000, popular: false },
  ],
};

export const GALERIA = {
  badge: 'Galería',
  title: 'Hecho en casa, con amor',
  description: 'Pronto: fotos reales de nuestros productos. Por ahora, dejá volar la imaginación…',
  items: [
    { emoji: '🥟', label: 'Empanaditas', color: 'from-vinotinto/10 to-oro/10' },
    { emoji: '🧀', label: 'Tequeños', color: 'from-oro/10 to-vinotinto/10' },
    { emoji: '🥟', label: 'Pastelitos', color: 'from-azul/10 to-vinotinto/10' },
    { emoji: '🥗', label: 'Salsas', color: 'from-vinotinto/10 to-azul/10' },
    { emoji: '🎉', label: 'Eventos', color: 'from-oro/10 to-azul/10' },
    { emoji: '👩‍🍳', label: 'Mamá cocinando', color: 'from-vinotinto/5 to-crema-dark' },
  ],
  cta: '📸 Seguinos en Instagram para ver nuestras creaciones del día',
};

export const COMO_PEDIR = {
  badge: 'Cómo pedir',
  title: 'Tres pasos para disfrutar',
  steps: [
    { number: '1', title: 'Elegí', description: 'Empanaditas, tequeños, pastelitos o combos. Mezclá como quieras.' },
    { number: '2', title: 'Mandá WhatsApp', description: 'Decinos tu pedido, la dirección y el día que lo necesitás.' },
    { number: '3', title: 'Recibí', description: 'Te lo llevamos a casa. Solo calentás y disfrutás.' },
  ],
  cta: 'Mandanos un WhatsApp',
  footer: 'Pedidos con anticipación · Delivery con costo adicional · Zona: Buenos Aires',
};

export const FOOTER = {
  description: 'Comida venezolana casera en Buenos Aires. Hecha con amor por una mamá venezolana.',
  contactTitle: 'Contacto',
  horariosTitle: 'Horarios',
  horariosLines: ['Pedidos con anticipación', 'Consultános por WhatsApp'],
  copyright: `© ${SITE.year} Guayafood. Todos los derechos reservados.`,
  signature: 'Hecho con ❤️ venezolano desde Buenos Aires',
};

export const NOT_FOUND = {
  title: 'Página no encontrada',
  description: 'Esta página no existe, pero las empanaditas sí.',
  emoji: '🇻🇪',
  cta: 'Volver al inicio',
};

export const DELIVERY = {
  zones: ['Capital Federal', 'CABA'],
  advanceHours: 24,
  workingDays: [1, 2, 3, 4, 5, 6],
  maxOrdersPerSlot: 3,
  timeSlots: [
    { label: '10:00 - 12:00 hs', value: '10:00-12:00' },
    { label: '14:00 - 16:00 hs', value: '14:00-16:00' },
    { label: '17:00 - 19:00 hs', value: '17:00-19:00' },
    { label: '19:00 - 21:00 hs', value: '19:00-21:00' },
  ],
  warningText: '📍 Solo entregamos en Capital Federal. Pedí con anticipación (mín 24 hs).',
};

export const MERCADOPAGO = {
  ordersApiUrl: '/api/create-order',
  preferencesApiUrl: '/api/create-preference',
  checkoutLink: 'https://link.mercadopago.com.ar/guayafood',
  buttonText: 'Comprar con Mercado Pago',
  currency: 'ARS',
};
