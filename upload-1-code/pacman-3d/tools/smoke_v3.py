# Lobby -> borough -> run: bubble, trail, passport, chompers joining after each task.
import asyncio, sys
from playwright.async_api import async_playwright
OUT = '/tmp/claude-0/shots/'
BOROUGH = sys.argv[1] if len(sys.argv) > 1 else 'brooklyn'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:300]))
        async def cdn(route): await route.fulfill(path='/tmp/claude-0/vendor/three.min.js', content_type='application/javascript')
        await pg.route('https://cdnjs.cloudflare.com/**', cdn)
        await pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + 'v3_lobby.png')
        await pg.click(f'#b-{BOROUGH}')
        for i in range(90):
            await pg.wait_for_timeout(1000)
            m = await pg.evaluate('PM.debug.state.mode')
            if m == 'play': break
        print('ready after', i + 1, 's, mode', m)
        await pg.evaluate("() => { const c=PM.debug.CFG; c.chomperBase=0.0; c.chomperPerTask=0; c.chomperPerSec=0; }")
        await pg.mouse.move(700, 250); await pg.mouse.down(); await pg.mouse.up()
        await pg.wait_for_timeout(4000)
        await pg.screenshot(path=OUT + 'v3_play.png')
        # visit a landmark
        await pg.evaluate("""() => { const d=PM.debug, s=d.state, B=d.B; const l=B.LANDMARKS.find(x=>!s.visited.has(x.name)); s.ghost.e=l.pos.e; s.ghost.s=l.pos.s; }""")
        await pg.wait_for_timeout(1200)
        print('after landmark mode', await pg.evaluate('PM.debug.state.mode'))
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(300)
        # complete 3 tasks
        for k in range(3):
            await pg.evaluate("""() => { const s=PM.debug.state, t=s.task; s.ghost.e=t.pos.e; s.ghost.s=t.pos.s; }""")
            await pg.wait_for_timeout(1200)
            await pg.keyboard.press('Space'); await pg.wait_for_timeout(600)
            print('tasks', await pg.evaluate("PM.debug.state.tasksDone"), 'chompers', await pg.evaluate("PM.debug.state.chompers.map(c=>c.kind+':'+Math.round(c.dist||0))"))
        await pg.mouse.move(400, 600)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + 'v3_passport.png')
        # revisit from passport
        await pg.click('.pp-item'); await pg.wait_for_timeout(500)
        print('revisit mode', await pg.evaluate('PM.debug.state.mode'))
        await pg.screenshot(path=OUT + 'v3_revisit.png')
        await pg.keyboard.press('Space')
        # let them catch us
        await pg.evaluate("() => { const c=PM.debug.CFG; c.chomperBase=1.0; PM.debug.state.ghost.started=true; }")
        for i in range(40):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('PM.debug.state.mode') == 'over': break
        print('final mode', await pg.evaluate('PM.debug.state.mode'))
        await pg.screenshot(path=OUT + 'v3_over.png')
        print('errors', errs[:6])
        await b.close()
asyncio.run(main())
