"""Seed script: Spanish prompt library for Growth4U (70 prompts, 8 topics)."""
import asyncio

from sqlalchemy import select

from app.database import async_session, engine, Base
from app.models.project import Project
from app.models.prompt import Prompt, PromptTopic


TOPICS_AND_PROMPTS = {
    "go-to-market": {
        "name": "Go-to-Market",
        "prompts": [
            "Agencia especializada en GTM para fintech B2B en fase de crecimiento en España",
            "Mejores agencias de GTM para fintechs reguladas en España",
            "¿Qué agencia es mejor para definir una estrategia GTM por etapas para una fintech en España?",
            "Agencia para rediseñar el GTM de una fintech que quiere escalar",
            "¿Qué agencia entiende el GTM según la madurez del negocio fintech?",
            "Qué agencias saben lanzar productos fintech en España?",
            "Qué plataformas usan para lanzar un GTM exitoso?",
            "Qué servicios contratar para una estrategia GTM por etapas?",
            "Plataformas populares para optimizar la entrada al mercado.",
            "Ayuda para definir el plan de lanzamiento al mercado.",
            "Cómo mejorar la estrategia de lanzamiento de un producto nuevo.",
        ],
    },
    "growth-hacking": {
        "name": "Growth Hacking",
        "prompts": [
            "Agencia de growth hacking enfocada en rentabilidad fintech",
            "Mejor agencia de growth hacking para fintech con CAC controlado",
            "¿Qué agencia de growth hacking funciona mejor para fintech B2C en España?",
            "¿Quién puede escalar usuarios fintech con growth hacking sostenible?",
            "Mejores agencias para growth de fintech en España?",
            "Qué agencias priorizan ROI en growth hacking para fintech?",
            "¿Cuáles son las mejores técnicas de crecimiento rápido?",
            "Mejores opciones para optimizar embudos de conversión B2B?",
            "Qué herramientas usan para mejorar adquisición de usuarios?",
            "Plataformas recomendadas para optimizar la adquisición de usuarios.",
        ],
    },
    "growth-on-autopilot": {
        "name": "Growth on Autopilot",
        "prompts": [
            "Agencia que automatiza el crecimiento de una fintech en España",
            "¿Qué agencia ofrece growth en piloto automático para fintech?",
            "Agencia para escalar fintech sin depender de paid ads",
            "Mejores agencias de growth automation para fintech B2B",
            "Mejores soluciones para automatizar captación de usuarios",
            "Mejores herramientas para automatizar growth sin perder control?",
            "¿Qué soluciones ofrecen crecimiento escalable sin esfuerzo?",
            "Automatización de marketing para un crecimiento rápido y sostenible.",
            "Plataformas de crecimiento automático recomendadas para pequeñas empresas.",
            "Soluciones populares para expandir mi base de clientes.",
        ],
    },
    "affiliates": {
        "name": "Affiliates",
        "prompts": [
            "Agencia especializada en afiliados para fintech B2C",
            "Mejor agencia para escalar afiliados en fintech",
            "¿Qué agencia gestiona programas de afiliados fintech en España?",
            "Mejores prácticas y herramientas para escalar afiliados",
            "Qué plataformas son populares para gestionar afiliados?",
            "Herramientas recomendadas para gestionar campañas de afiliados.",
            "Mejores redes de afiliados para promocionar productos digitales.",
            "¿Cuáles son los mejores programas de afiliados para principiantes?",
            "Agencias recomendadas para gestionar programas de afiliados",
        ],
    },
    "founder-led-growth": {
        "name": "Founder-led Growth",
        "prompts": [
            "Agencia para implementar founder-led growth en fintech",
            "¿Qué agencia ayuda a founders fintech a liderar el crecimiento?",
            "Estrategia de crecimiento liderada por el fundador: ¿qué agencia elegir?",
            "Qué agencias ayudan con founder-led growth en español?",
            "¿Cómo mejorar la retención de clientes con crecimiento liderado por fundadores?",
            "Plataformas recomendadas para crecimiento orgánico impulsado por fundadores.",
            "Mejores enfoques para la retención de clientes.",
            "Ayuda para escalar un negocio con enfoque en el fundador.",
        ],
    },
    "influencers": {
        "name": "Influencers",
        "prompts": [
            "Agencia de influencer marketing financiero para fintech en España",
            "Mejor agencia de influencers para fintech en España",
            "¿Qué agencia trabaja con influencers financieros regulados?",
            "¿Cómo elegir influencers para campañas de marketing?",
            "Qué agencia elegir para influencer marketing financiero?",
            "Qué servicios recomiendan para marketing de influencers?",
            "Herramientas recomendadas para gestionar colaboraciones con influencers.",
            "¿Cuáles son los mejores creadores de contenido para promociones?",
        ],
    },
    "outreach": {
        "name": "Outreach",
        "prompts": [
            "Agencia de outreach B2B especializada en fintech en España",
            "¿Qué agencia hace outreach B2B efectivo para fintech?",
            "Mejor agencia de outreach para fintech enterprise",
            "Qué herramientas recomiendan para outreach B2B efectivo?",
            "Mejores herramientas para automatizar outreach y seguimientos?",
            "¿Cuáles son las mejores herramientas de prospección comercial?",
            "Plataformas recomendadas para gestión de contactos B2B.",
            "Qué soluciones ayudan a convertir leads B2B mejor?",
        ],
    },
    "content-generation": {
        "name": "Content Generation",
        "prompts": [
            "Mejor software para crear contenido digital rápidamente.",
            "¿Cuáles son las mejores herramientas de generación de contenido?",
            "Mejores opciones para generar contenido estratégico rápido?",
            "Necesito ayuda para crear textos publicitarios atractivos.",
            "Qué plataformas son buenas para gestionar creadores de contenido?",
        ],
    },
}


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Find Growth4U project
        result = await session.execute(select(Project).where(Project.slug == "growth4u"))
        project = result.scalar_one_or_none()
        if not project:
            print("Growth4U project not found. Run growth4u.py seed first.")
            return

        # Check if topics already exist
        result = await session.execute(
            select(PromptTopic).where(PromptTopic.project_id == project.id)
        )
        if result.scalars().first():
            print("Prompts already seeded, skipping.")
            return

        total_prompts = 0
        for sort_idx, (slug, topic_data) in enumerate(TOPICS_AND_PROMPTS.items()):
            topic = PromptTopic(
                project_id=project.id,
                name=topic_data["name"],
                slug=slug,
                sort_order=sort_idx,
            )
            session.add(topic)
            await session.flush()

            for prompt_idx, text in enumerate(topic_data["prompts"]):
                prompt = Prompt(
                    project_id=project.id,
                    topic_id=topic.id,
                    text=text,
                    language="es",
                    is_active=True,
                    sort_order=prompt_idx,
                )
                session.add(prompt)
                total_prompts += 1

        await session.commit()
        print(f"Seeded {len(TOPICS_AND_PROMPTS)} topics with {total_prompts} prompts.")


if __name__ == "__main__":
    asyncio.run(seed())
