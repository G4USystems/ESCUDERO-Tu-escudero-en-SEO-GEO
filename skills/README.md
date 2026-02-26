# Marketing Skills Toolkit

Este directorio contiene **26 skills especializadas** para tareas de marketing digital. Cada skill es un experto en un dominio específico con instrucciones detalladas y frameworks probados.

## 🎯 Cómo usar

### Opción 1: Automático (Recomendado)
Simplemente pedí lo que necesitás. El **skill-router** automáticamente identificará y ejecutará la skill correcta:

```
"Quiero mejorar el copy de mi homepage"
→ Auto-ruta a copywriting

"Necesito auditar el SEO de mi sitio"
→ Auto-ruta a seo-audit

"Dame ideas para un programa de referidos"
→ Auto-ruta a referral-program
```

### Opción 2: Manual
Si sabés exactamente qué skill necesitás, podés invocarla directamente:
```
"Usá la skill de email-sequence para armar una secuencia de bienvenida"
```

---

## 📚 Catálogo de Skills

### 🎨 Conversion & CRO (7 skills)
Optimización de tasas de conversión en cada punto de contacto.

| Skill | Cuándo usarla |
|-------|---------------|
| **[ab-test-setup](ab-test-setup/)** | Configurar A/B tests, experimentos, variantes |
| **[form-cro](form-cro/)** | Optimizar formularios, reducir fricción |
| **[onboarding-cro](onboarding-cro/)** | Mejorar onboarding, activación de usuarios |
| **[page-cro](page-cro/)** | Optimizar landing pages, páginas de producto |
| **[paywall-upgrade-cro](paywall-upgrade-cro/)** | Mejorar flujo de upgrade, checkout |
| **[popup-cro](popup-cro/)** | Diseñar popups efectivos, lead capture |
| **[signup-flow-cro](signup-flow-cro/)** | Optimizar proceso de registro |

### ✍️ Content & Copy (5 skills)
Crear y optimizar contenido persuasivo.

| Skill | Cuándo usarla |
|-------|---------------|
| **[copywriting](copywriting/)** | Escribir copy para páginas, headlines, CTAs |
| **[copy-editing](copy-editing/)** | Editar y pulir textos existentes |
| **[content-strategy](content-strategy/)** | Planificar estrategia de contenido |
| **[social-content](social-content/)** | Crear posts para redes sociales |
| **[email-sequence](email-sequence/)** | Diseñar secuencias de emails, drips |

### 🔍 SEO (3 skills)
Optimización para motores de búsqueda.

| Skill | Cuándo usarla |
|-------|---------------|
| **[seo-audit](seo-audit/)** | Auditoría técnica y on-page SEO |
| **[schema-markup](schema-markup/)** | Agregar datos estructurados, rich snippets |
| **[programmatic-seo](programmatic-seo/)** | Crear páginas SEO a escala |

### 🎯 Strategy (7 skills)
Planificación estratégica de marketing.

| Skill | Cuándo usarla |
|-------|---------------|
| **[marketing-ideas](marketing-ideas/)** | Brainstorm, ideas de crecimiento |
| **[marketing-psychology](marketing-psychology/)** | Aplicar psicología, persuasión |
| **[pricing-strategy](pricing-strategy/)** | Diseñar modelos de pricing |
| **[launch-strategy](launch-strategy/)** | Planificar lanzamiento de producto |
| **[free-tool-strategy](free-tool-strategy/)** | Crear lead magnets, herramientas gratis |
| **[referral-program](referral-program/)** | Diseñar programas de referidos |
| **[product-marketing-context](product-marketing-context/)** | Definir positioning, target, value prop |

### 📊 Research & Analysis (3 skills)
Investigación de mercado y análisis.

| Skill | Cuándo usarla |
|-------|---------------|
| **[competitor-alternatives](competitor-alternatives/)** | Analizar competencia, alternatives pages |
| **[analytics-tracking](analytics-tracking/)** | Configurar analytics, tracking |
| **[paid-ads](paid-ads/)** | Crear y optimizar ads pagos |

### 🤖 Meta (1 skill)
Orquestación automática de skills.

| Skill | Cuándo usarla |
|-------|---------------|
| **[skill-router](skill-router/)** | Automáticamente identifica la skill correcta |

---

## 🔄 Workflow típico

### Ejemplo 1: Nueva landing page
```
1. product-marketing-context (definir positioning)
2. copywriting (escribir el copy)
3. page-cro (optimizar conversión)
4. ab-test-setup (testear variantes)
5. analytics-tracking (medir resultados)
```

### Ejemplo 2: Lanzamiento de producto
```
1. product-marketing-context (posicionamiento)
2. launch-strategy (plan de lanzamiento)
3. copywriting (copy de anuncio)
4. email-sequence (campaña de lanzamiento)
5. social-content (posts de redes)
```

### Ejemplo 3: Mejorar conversión
```
1. page-cro (auditoría de página)
2. form-cro (optimizar formulario)
3. copywriting (mejorar mensajes)
4. ab-test-setup (testear cambios)
```

---

## 💡 Tips

**1. Contexto es clave**
Muchas skills revisan `.claude/product-marketing-context.md` primero. Si trabajás en el mismo producto, creá ese archivo para no repetir contexto.

**2. Combinar skills**
Podés usar múltiples skills en secuencia:
```
"Primero usá marketing-ideas para brainstormear,
luego copywriting para escribir el copy"
```

**3. Iterar**
Las skills están diseñadas para trabajo iterativo:
```
"Ahora revisá el copy con copy-editing"
"Mejoralo con marketing-psychology"
```

**4. Dejá que el router decida**
Si no estás seguro qué skill usar, simplemente describí lo que necesitás. El skill-router elegirá por vos.

---

## 🛠️ Estructura de cada skill

Cada skill sigue este formato:

```markdown
---
name: skill-name
version: 1.0.0
description: Cuando usar esta skill
---

# Nombre de la Skill

[Rol/Objetivo]

## Contexto inicial
[Qué información necesita primero]

## Framework/Metodología
[Paso a paso de cómo trabaja]

## Output
[Qué entrega al final]
```

---

## 📖 Créditos

Skills originales de [github.com/coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)

**skill-router** creado custom para este proyecto.

---

## 🚀 Próximos pasos

¿Querés probar? Pedime algo de marketing y dejá que el skill-router haga su magia:

- "Quiero mejorar mi tasa de conversión"
- "Necesito copy para una nueva feature"
- "Dame ideas para crecer mi producto"
- "Ayudame a lanzar mi nuevo SaaS"
