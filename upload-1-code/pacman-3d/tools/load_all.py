# Loads every borough from the lobby and checks it reaches play with no errors.
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        async def cdn(route): await route.fulfill(path='/tmp/claude-0/vendor/three.min.js', content_type='application/javascript')
        await pg.route('https://cdnjs.cloudflare.com/**', cdn)
        await pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
        for bid in ['queens', 'bronx', 'staten', 'brooklyn', 'manhattan']:
            await pg.evaluate(f"PM.debug.pick('{bid}')")
            for i in range(120):
                await pg.wait_for_timeout(500)
                if await pg.evaluate('PM.debug.state.mode') == 'play': break
            info = await pg.evaluate("() => { const B=PM.debug.B, s=PM.debug.state; return [B.id, B.LANDMARKS.length, B.TARGETS.length, s.task.name, B.graph.nx.length] }")
            await pg.evaluate("() => { const s=PM.debug.state, t=s.task; s.ghost.started=true; s.ghost.e=t.pos.e; s.ghost.s=t.pos.s; }")
            await pg.wait_for_timeout(1500)
            mode = await pg.evaluate('PM.debug.state.mode')
            await pg.screenshot(path=f'/tmp/claude-0/shots/v3_{bid}.png')
            print(info, 'after reaching target:', mode, 'errors:', errs[-2:] if errs else 'none')
            await pg.keyboard.press('Space'); await pg.wait_for_timeout(300)
            await pg.evaluate("() => { PM.debug.state.mode='lobby'; PM.UI.showLobby(); }")
        await b.close()
asyncio.run(main())
