// Genera seed.sql con datos de EJEMPLO (marcas y precios ficticios, sin fotos).
// Luisa reemplaza todo desde el panel. Uso: node seed/build-seed.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** EAN-13 en el rango 200-299 (uso interno de tienda), con dígito de control. */
function ean(n) {
  const base = `200${String(n).padStart(9, "0")}`;
  const sum = [...base].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}

const categories = [
  ["Alimento", "alimento", "Concentrado seco y húmedo para cada etapa.", "ambos", 1],
  ["Snacks", "snacks", "Para el antojo de media tarde.", "ambos", 2],
  ["Premios", "premios", "Recompensas pequeñas para entrenar y consentir.", "ambos", 3],
  ["Collares", "collares", "Cómodos, ajustables y con argolla para la placa.", "ambos", 4],
  ["Correas", "correas", "Para paseos largos por el parque.", "perro", 5],
  ["Platos", "platos", "Comederos y bebederos que no se voltean.", "ambos", 6],
];

// [nombre, categoría, especie, marca, etiqueta variante, destacado, descripción, variantes[[nombre, precio, antes, stock, min]]]
const products = [
  ["Concentrado adulto raza mediana pollo y arroz", "alimento", "perro", "Campo Verde", "Peso", 1,
    "Croquetas de tamaño medio con proteína de pollo como primer ingrediente. Para perros adultos de 10 a 25 kg.",
    [["2 kg", 38900, null, 14, 4], ["8 kg", 129900, 142000, 6, 2], ["15 kg", 219900, null, 3, 2]]],
  ["Concentrado cachorro raza pequeña", "alimento", "perro", "Campo Verde", "Peso", 0,
    "Croqueta pequeña y blanda para dientes de leche, con DHA.",
    [["1 kg", 24900, null, 10, 3], ["4 kg", 79900, null, 5, 2]]],
  ["Alimento gato adulto salmón", "alimento", "gato", "Gatuno", "Peso", 1,
    "Receta con salmón y control de bolas de pelo para gatos de interior.",
    [["1.5 kg", 42900, null, 9, 3], ["7 kg", 168000, 185000, 4, 2]]],
  ["Alimento gato esterilizado", "alimento", "gato", "Gatuno", "Peso", 0,
    "Menos grasa y más fibra para gatos esterilizados que prefieren el sofá.",
    [["1.5 kg", 45900, null, 2, 3], ["7 kg", 174000, null, 0, 2]]],
  ["Sobre húmedo gato pavo en salsa", "alimento", "gato", "Gatuno", "Presentación", 0,
    "Trocitos en salsa, 85 g. Ideal para mezclar con el concentrado.",
    [["1 sobre", 3900, null, 60, 12], ["Caja x 12", 42000, 46800, 8, 3]]],
  ["Galletas de avena y manzana", "snacks", "perro", "Huellitas", "Sabor", 1,
    "Horneadas, sin colorantes. Crujientes por fuera, suaves por dentro.",
    [["Avena y manzana 200 g", 14900, null, 22, 5], ["Mantequilla de maní 200 g", 15900, null, 18, 5]]],
  ["Palitos dentales", "snacks", "perro", "Huellitas", "Tamaño", 0,
    "Ayudan a reducir el sarro mientras mastica. Bolsa x 7.",
    [["Raza pequeña", 18900, null, 15, 4], ["Raza grande", 24900, null, 7, 3]]],
  ["Crema lamible para gato atún", "snacks", "gato", "Gatuno", "Presentación", 1,
    "Tubitos de crema para dar en la mano. El momento favorito del día.",
    [["Pack x 4", 9900, null, 30, 8], ["Pack x 20", 44900, 49500, 6, 2]]],
  ["Hígado deshidratado", "premios", "ambos", "Campo Verde", "Peso", 0,
    "Un solo ingrediente: hígado de res. Se parte con la mano en trocitos.",
    [["80 g", 16900, null, 12, 4], ["250 g", 42900, null, 4, 2]]],
  ["Premios de entrenamiento pollo", "premios", "perro", "Huellitas", "Sabor", 1,
    "Bocados pequeños y bajos en calorías para repetir muchas veces.",
    [["Pollo 150 g", 13900, null, 25, 6], ["Cordero 150 g", 14900, null, 11, 6]]],
  ["Hierba gatera orgánica", "premios", "gato", "Gatuno", "Presentación", 0,
    "Catnip seco para espolvorear sobre su rascador o juguete.",
    [["Frasco 20 g", 12900, null, 9, 3]]],
  ["Collar acolchado ajustable", "collares", "perro", "Maya Básicos", "Talla", 1,
    "Interior acolchado que no irrita el cuello y hebilla de liberación rápida.",
    [["S", 24900, null, 8, 3], ["M", 27900, null, 10, 3], ["L", 31900, null, 2, 3]]],
  ["Collar reflectivo con placa", "collares", "perro", "Maya Básicos", "Talla", 0,
    "Cinta reflectiva para los paseos de la noche. Incluye placa para grabar.",
    [["S", 34900, null, 6, 2], ["M", 36900, null, 5, 2], ["L", 39900, null, 4, 2]]],
  ["Collar para gato con cascabel", "collares", "gato", "Gatuno", "Color", 0,
    "Con broche de seguridad que se abre si se engancha.",
    [["Verde petróleo", 14900, null, 12, 4], ["Amarillo", 14900, null, 9, 4]]],
  ["Correa de nylon 1.5 m", "correas", "perro", "Maya Básicos", "Talla", 1,
    "Mango acolchado y mosquetón giratorio que no se enreda.",
    [["Delgada", 29900, null, 9, 3], ["Gruesa", 34900, null, 7, 3]]],
  ["Correa retráctil 5 m", "correas", "perro", "Campo Verde", "Tamaño", 0,
    "Freno con un solo botón. Para perros de hasta 25 kg.",
    [["Hasta 12 kg", 59900, 69900, 4, 2], ["Hasta 25 kg", 74900, null, 3, 2]]],
  ["Arnés pechera antitirones", "correas", "perro", "Maya Básicos", "Talla", 1,
    "Argolla delantera que corrige el tirón sin presionar el cuello.",
    [["S", 54900, null, 5, 2], ["M", 59900, null, 6, 2], ["L", 64900, null, 1, 2]]],
  ["Plato de acero antideslizante", "platos", "ambos", "Maya Básicos", "Tamaño", 0,
    "Acero inoxidable con base de caucho. Va a la lavadora de platos.",
    [["500 ml", 19900, null, 16, 4], ["1.2 L", 27900, null, 9, 3]]],
  ["Comedero lento laberinto", "platos", "perro", "Huellitas", "Color", 1,
    "Para los que comen en diez segundos: el laberinto alarga la comida y evita el atoro.",
    [["Verde petróleo", 39900, null, 7, 2], ["Amarillo", 39900, null, 5, 2]]],
  ["Fuente de agua para gato 2 L", "platos", "gato", "Gatuno", "Presentación", 0,
    "El agua en movimiento invita a tomar más. Filtro de carbón incluido.",
    [["Fuente + 1 filtro", 89900, 99900, 3, 2], ["Repuesto x 3 filtros", 24900, null, 10, 3]]],
];

const seasons = [
  ["halloween", "Halloween", 1, "2026-10-01", "2026-10-31", "Disfraces, dulces y cero sustos",
    "Disfraces cómodos y premios para que tu peludo también pida dulce.", "Ver premios", "premios", "", [6, 8, 10]],
  ["navidad", "Navidad", 0, "2026-12-01", "2026-12-25", "Navidad con toda la familia",
    "Regalos para quien te recibe en la puerta moviendo la cola.", "Ver regalos", null, "", []],
  ["ano-nuevo", "Año Nuevo", 0, "2026-12-26", "2027-01-06", "Año nuevo, paseos nuevos",
    "Sin pólvora, por favor: todo para una noche tranquila en casa.", "Ver la colección", null, "", []],
  ["amor-amistad", "Amor y Amistad", 0, "2027-09-01", "2027-09-30", "Tu mejor amigo tiene cuatro patas",
    "Detalles para celebrar a quien te quiere sin condiciones.", "Ver detalles", null, "", []],
];

const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const out = [
  "-- Datos de EJEMPLO generados por seed/build-seed.mjs. No editar a mano.",
  "DELETE FROM stock_movements; DELETE FROM product_images; DELETE FROM product_variants;",
  "DELETE FROM products; DELETE FROM categories; DELETE FROM season_events; DELETE FROM staff_users;",
  "DELETE FROM sqlite_sequence WHERE name IN ('categories','products','product_variants','product_images','stock_movements','season_events','staff_users');",
];

categories.forEach(([name, slug, desc, species, order], i) => {
  out.push(
    `INSERT INTO categories (id, name, slug, description, species, sort_order) VALUES (${i + 1}, ${q(name)}, ${q(slug)}, ${q(desc)}, ${q(species)}, ${order});`,
  );
});
const catId = Object.fromEntries(categories.map(([, slug], i) => [slug, i + 1]));

let variantId = 0;
products.forEach(([name, cat, species, brand, label, featured, desc, variants], i) => {
  const pid = i + 1;
  out.push(
    `INSERT INTO products (id, name, slug, description, category_id, species, brand, variant_label, featured) VALUES (${pid}, ${q(name)}, ${q(slugify(name))}, ${q(desc)}, ${catId[cat]}, ${q(species)}, ${q(brand)}, ${q(label)}, ${featured});`,
  );
  variants.forEach(([vname, price, before, stock, min], j) => {
    variantId += 1;
    const sku = `MAYA-${String(pid).padStart(3, "0")}-${j + 1}`;
    out.push(
      `INSERT INTO product_variants (id, product_id, name, sku, barcode, price, compare_at_price, stock, min_stock, sort_order) VALUES (${variantId}, ${pid}, ${q(vname)}, ${q(sku)}, ${q(ean(variantId))}, ${price}, ${q(before)}, ${stock}, ${min}, ${j});`,
    );
    out.push(
      `INSERT INTO stock_movements (variant_id, delta, stock_after, reason, note, user_name) VALUES (${variantId}, ${stock}, ${stock}, 'CREACION', 'Inventario inicial de ejemplo', 'Sistema');`,
    );
  });
});

seasons.forEach(([slug, name, enabled, start, end, headline, message, cta, catSlug, discount, featured]) => {
  out.push(
    `INSERT INTO season_events (slug, name, enabled, starts_at, ends_at, headline, message, cta_label, category_slug, discount_note, featured_product_ids) VALUES (${q(slug)}, ${q(name)}, ${enabled}, ${q(start)}, ${q(end)}, ${q(headline)}, ${q(message)}, ${q(cta)}, ${q(catSlug)}, ${q(discount)}, ${q(JSON.stringify(featured))});`,
  );
});

out.push(
  `INSERT INTO staff_users (email, name, roles) VALUES ('luisa@mayapets.co', 'Luisa', '["admin"]');`,
  `INSERT INTO staff_users (email, name, roles) VALUES ('ventas@mayapets.co', 'Mostrador', '["vendedor"]');`,
  `INSERT INTO staff_users (email, name, roles) VALUES ('adopciones@mayapets.co', 'Equipo de adopciones', '["adopciones"]');`,
);

writeFileSync(fileURLToPath(new URL("./seed.sql", import.meta.url)), out.join("\n") + "\n");
console.log(`seed.sql: ${categories.length} categorías, ${products.length} productos, ${variantId} variantes, ${seasons.length} temporadas`);
