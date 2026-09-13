#!/usr/bin/env python3
from pathlib import Path

p = Path('app/src/main/java/com/hailey/minefinds/MainActivity.java')
s = p.read_text()

old_sync = 'if(loud)toast("Shared world synced"); showNearby();'
new_sync = 'if(loud)toast("Shared world synced"); if(FindSyncUiPolicy.shouldRefreshAfterSync(loud)) showNearby();'
if old_sync not in s:
    raise SystemExit('Expected silent-sync navigation pattern not found')
s = s.replace(old_sync, new_sync, 1)

old_save = 'save.setOnClickListener(v -> { if (name.getText().toString().trim().isEmpty()) { toast("Give this find a name"); return; } Integer xi=asInt(x),yi=asInt(y),zi=asInt(z); if(xi==null||yi==null||zi==null)return; db.addFind(activeWorld.id,name.getText().toString(),String.valueOf(cat.getSelectedItem()),xi,yi,zi,notes.getText().toString()); toast("Find saved"); if(activeWorld.shared) syncActiveWorld(false); else showNearby(); });'
new_save = '''save.setOnClickListener(v -> {
            if (name.getText().toString().trim().isEmpty()) { toast("Give this find a name"); return; }
            Integer xi=asInt(x),yi=asInt(y),zi=asInt(z);
            if(xi==null||yi==null||zi==null)return;
            try {
                long savedId=db.addFind(activeWorld.id,name.getText().toString(),String.valueOf(cat.getSelectedItem()),xi,yi,zi,notes.getText().toString());
                if(savedId<=0){toast("Find was not saved. Your form is still here.");return;}
            } catch(Exception e) {
                toast("Could not save find. Your form is still here.");
                return;
            }
            toast("Find saved on this phone");
            showNearby();
            if(activeWorld.shared) syncActiveWorld(false);
        });'''
if old_save not in s:
    raise SystemExit('Expected Log Find save handler not found')
s = s.replace(old_save, new_save, 1)

old_delete = 'db.deleteFind(f.id);if(activeWorld.shared)syncActiveWorld(false);else showAllFinds();'
new_delete = 'db.deleteFind(f.id);showAllFinds();if(activeWorld.shared)syncActiveWorld(false);'
if old_delete not in s:
    raise SystemExit('Expected shared delete handler not found')
s = s.replace(old_delete, new_delete, 1)

old_edit = 'db.updateFind(f);if(activeWorld.shared)syncActiveWorld(false);else showAllFinds();'
new_edit = 'db.updateFind(f);showAllFinds();if(activeWorld.shared)syncActiveWorld(false);'
if old_edit not in s:
    raise SystemExit('Expected shared edit handler not found')
s = s.replace(old_edit, new_edit, 1)

p.write_text(s)
