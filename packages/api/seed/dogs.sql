-- 6 perritos de EJEMPLO para Adopción (sin fotos: Luisa sube las reales desde el panel).
-- Se puede correr varias veces: no duplica (INSERT OR IGNORE por slug).
INSERT OR IGNORE INTO dogs (slug, name, sex, age_months, size, weight_kg, breed, energy, temperament, good_with_kids, good_with_dogs, good_with_cats, sterilized, vaccinated, dewormed, story, special_needs, status, featured) VALUES
('canela', 'Canela', 'hembra', 30, 'mediano', 14, 'Criolla', 'media', 'Cariñosa, curiosa y muy buena compañera de paseo.', 'si', 'si', 'por_saber', 1, 1, 1,
 'La encontraron debajo de un carro en Suba, empapada y con miedo. Hoy pide caricias con la pata y duerme patas arriba.', '', 'disponible', 1),
('toby', 'Toby', 'macho', 6, 'pequeno', 4, 'Criollo', 'alta', 'Juguetón sin pausa; aprende rápido con premios.', 'si', 'si', 'si', 0, 1, 1,
 'Llegó con sus hermanos en una caja. Es el más travieso y el primero en la fila para comer.', 'Se esteriliza al cumplir la edad; el costo lo asume la fundación.', 'disponible', 1),
('luna', 'Luna', 'hembra', 84, 'grande', 26, 'Mestiza de pastor', 'baja', 'Tranquila, noble y muy paciente.', 'si', 'si', 'no', 1, 1, 1,
 'Vivió años amarrada en una finca. Ahora descubre el sofá y no lo quiere soltar.', 'Mejor en casa sin gatos.', 'disponible', 0),
('rocky', 'Rocky', 'macho', 20, 'grande', 30, 'Criollo', 'alta', 'Atlético y alegre; necesita correr todos los días.', 'si', 'por_saber', 'no', 1, 1, 1,
 'Lo rescataron en la autopista Norte. Es puro corazón y pura energía: ideal para familias que salen a trotar.', 'Necesita paseos largos o patio.', 'disponible', 0),
('pelusa', 'Pelusa', 'hembra', 108, 'pequeno', 6, 'Mestiza de french poodle', 'baja', 'Dormilona, dulce y muy tranquila.', 'si', 'si', 'si', 1, 1, 1,
 'Su dueña falleció y quedó sola. Es una abuelita que solo pide una cobija y compañía.', 'Revisión dental cada año.', 'disponible', 1),
('max', 'Max', 'macho', 42, 'mediano', 17, 'Criollo', 'media', 'Leal y protector; se demora un poco en confiar.', 'por_saber', 'no', 'por_saber', 1, 1, 1,
 'Llegó muy flaco desde Soacha. Con paciencia se volvió el perro más fiel del refugio.', 'Mejor como único perro de la casa.', 'en_proceso', 0);
