# Cursor steering: the ghost should close in on a point the cursor holds on.
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        async def cdn(route): await route.fulfill(path='/tmp/claude-0/vendor/three.min.js', content_type='application/javascript')
        await pg.route('https://cdnjs.cloudflare.com/**', cdn)
        await pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(5000)
        await pg.click('#btn-start'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const c=PM.debug.CFG; c.chomperBase=0; c.chomperPerTask=0; c.chomperPerSec=0; }")
        await pg.mouse.move(1000, 250); await pg.mouse.down(); await pg.mouse.up()
        # fixed world goal = where the cursor first points
        goal = await pg.evaluate("() => PM.debug.world.groundAt(1000/1, 250)")
        d = []
        for i in range(8):
            # keep the cursor on the goal as the camera moves
            sp = await pg.evaluate(f"() => PM.debug.world.toScreen(({goal[0]}), ({goal[1]}))")
            await pg.mouse.move(max(5, min(1275, sp[0])), max(5, min(795, sp[1])))
            await pg.wait_for_timeout(700)
            dist = await pg.evaluate(f"() => {{ const s=PM.debug.state, g=PM.debug.graph.pointAt(s.ghost.e,s.ghost.s); return Math.round(Math.hypot(g[0]-({goal[0]}), g[1]-({goal[1]}))) }}")
            d.append(dist)
        print('distance to cursor goal over time (m):', d, 'errors', errs)
        await b.close()
asyncio.run(main())
