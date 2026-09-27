import asyncio, sys
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type in ('error','warning') and errs.append(m.text[:200]))
        async def cdn(route):
            await route.fulfill(path='/tmp/claude-0/vendor/three.min.js', content_type='application/javascript')
        await pg.route('https://cdnjs.cloudflare.com/**', cdn)
        await pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        await pg.goto('http://localhost:8765/index.html')
        for i in range(30):
            await pg.wait_for_timeout(1000)
            pr = await pg.evaluate("PM.debug.world.buildProgress")
            if pr > 0.99: break
        print('build progress', pr, 'after', i+1, 's')
        await pg.screenshot(path=OUT+'a_title.png')
        await pg.click('#btn-start'); await pg.wait_for_timeout(500)
        await pg.mouse.move(640, 150)
        await pg.mouse.down(); await pg.mouse.up()
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path=OUT+'b_play.png')
        info = await pg.evaluate("""() => { const s=PM.debug.state; return {mode:s.mode, task:s.task.name, moving:s.ghost.moving, started:s.ghost.started, street:document.getElementById('street').textContent} }""")
        print(info)
        # teleport to a landmark to show the card
        await pg.evaluate("""() => { const d=PM.debug, s=d.state; const l=d.LANDMARKS.find(x=>x.name==='Flatiron Building'); s.ghost.e=l.pos.e; s.ghost.s=l.pos.s; s.ghost.moving=true; s.chomper.spawnFx=5; }""")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT+'c_card.png')
        print('mode', await pg.evaluate("PM.debug.state.mode"))
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(300)
        # go near target to see highlight
        await pg.evaluate("""() => { const s=PM.debug.state, t=s.task; const n=PM.debug.graph.nearest(t.sx+150, t.sy+150, 800); s.ghost.e=n.e; s.ghost.s=n.s; s.ghost.moving=false; s.ghost.node=n.e.a; s.chomper.spawnFx=5; }""")
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT+'d_target.png')
        print('target', await pg.evaluate("PM.debug.state.task.name"))
        fps = await pg.evaluate("""() => new Promise(r=>{let n=0;const t0=performance.now();function f(){n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else r(n/3);} requestAnimationFrame(f);})""")
        print('fps (software GL)', fps)
        print('errors', errs[:8])
        await b.close()
asyncio.run(main())
