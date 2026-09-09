from pathlib import Path

p = Path('app/src/main/java/com/hailey/minefinds/MainActivity.java')
s = p.read_text()

s = s.replace('import android.content.Intent;\n', 'import android.content.Intent;\nimport android.content.ClipData;\nimport android.content.ClipboardManager;\n')
s = s.replace('import android.os.Bundle;\n', 'import android.os.Bundle;\nimport android.os.Handler;\nimport android.os.Looper;\n')

needle = '    private MineFindsSyncClient sync;\n'
if 'private final Handler syncTicker' not in s:
    s = s.replace(needle, needle + '''    private final Handler syncTicker = new Handler(Looper.getMainLooper());\n    private boolean syncInFlight = false;\n    private final Runnable periodicSync = new Runnable() {\n        @Override public void run() {\n            if (activeWorld != null && activeWorld.shared) syncActiveWorld(false);\n            syncTicker.postDelayed(this, 30000);\n        }\n    };\n''', 1)

on_create = '''    @Override protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        db = new DatabaseHelper(this);\n        sync = new MineFindsSyncClient(this);\n        renderHome();\n    }\n\n'''
if 'syncTicker.postDelayed(periodicSync' not in s:
    lifecycle = on_create + '''    @Override protected void onResume() {\n        super.onResume();\n        syncTicker.removeCallbacks(periodicSync);\n        syncTicker.postDelayed(periodicSync, 1200);\n    }\n\n    @Override protected void onPause() {\n        syncTicker.removeCallbacks(periodicSync);\n        super.onPause();\n    }\n\n'''
    if on_create not in s:
        raise SystemExit('onCreate pattern not found')
    s = s.replace(on_create, lifecycle, 1)

old_cloud = '        LinearLayout cloudRow=horizontal(); Button share=btn(activeWorld.shared?"Share code":"Share world"); share.setOnClickListener(v -> showShareWorld()); cloudRow.addView(share,weight()); Button syncBtn=btn("Sync now"); syncBtn.setOnClickListener(v -> syncActiveWorld(true)); cloudRow.addView(syncBtn,weight()); page.addView(cloudRow);\n        showPlayers();'
new_cloud = '''        LinearLayout cloudRow=horizontal();\n        Button share=btn(activeWorld.shared?"Show share code":"Get share code");\n        share.setOnClickListener(v -> showShareWorld());\n        cloudRow.addView(share,weight());\n        Button syncBtn=btn("Sync now");\n        syncBtn.setOnClickListener(v -> syncActiveWorld(true));\n        cloudRow.addView(syncBtn,weight());\n        page.addView(cloudRow);\n        showSharedWorldCard();\n        showPlayers();'''
if old_cloud not in s:
    raise SystemExit('cloud row pattern not found')
s = s.replace(old_cloud, new_cloud, 1)

old_world = '''        new AlertDialog.Builder(this).setTitle("New Minecraft world").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",null).setOnShowListener(d -> ((AlertDialog)d).getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> { String n=name.getText().toString().trim(),s=seed.getText().toString().trim(),ver=version.getText().toString().trim(); if(n.isEmpty()||s.isEmpty()||ver.isEmpty()){toast("World name, seed, and version are required");return;} db.addWorld(n,s,String.valueOf(edition.getSelectedItem()),ver,String.valueOf(dimension.getSelectedItem())); d.dismiss(); refreshWorlds(); })).show();'''
new_world = '''        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("New Minecraft world").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();\n        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> { String n=name.getText().toString().trim(),s=seed.getText().toString().trim(),ver=version.getText().toString().trim(); if(n.isEmpty()||s.isEmpty()||ver.isEmpty()){toast("World name, seed, and version are required");return;} db.addWorld(n,s,String.valueOf(edition.getSelectedItem()),ver,String.valueOf(dimension.getSelectedItem())); dialog.dismiss(); refreshWorlds(); }));\n        dialog.show();'''
if old_world in s:
    s = s.replace(old_world, new_world, 1)

start = s.index('    private interface NameCallback')
end = s.index('    private void openSeedMap', start)
new_block = r'''    private interface NameCallback { void got(String name); }
    private void askDisplayName(String title, NameCallback onName){
        EditText name=field("Your name");
        name.setText(activeWorld!=null&&activeWorld.displayName!=null?activeWorld.displayName:"");
        new AlertDialog.Builder(this).setTitle(title).setView(name).setNegativeButton("Cancel",null).setPositiveButton("Continue",(d,w)->{
            String n=name.getText().toString().trim(); if(n.isEmpty())n="Player"; onName.got(n);
        }).show();
    }

    private String savedShareCode(World world) {
        if (world == null || world.cloudUuid == null) return "";
        return getSharedPreferences("minefinds_share_codes", MODE_PRIVATE).getString("code_" + world.cloudUuid, "");
    }

    private void saveShareCode(World world, String code) {
        if (world == null || world.cloudUuid == null || code == null) return;
        getSharedPreferences("minefinds_share_codes", MODE_PRIVATE).edit().putString("code_" + world.cloudUuid, code).apply();
    }

    private void copyShareCode(String code) {
        ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
        if(clipboard!=null){ clipboard.setPrimaryClip(ClipData.newPlainText("MineFinds share code",code)); toast("Share code copied"); }
    }

    private void showSharedWorldCard() {
        if(activeWorld==null || !activeWorld.shared) return;
        spacer(); cardTitle("Shared world ☁");
        String code=savedShareCode(activeWorld);
        if(ShareCodePresentation.shouldShowSavedCode(true, code)){
            final String visibleCode=ShareCodePresentation.normalizedForDisplay(code);
            paragraph("Use this code on the second phone:");
            TextView codeView=tv(visibleCode,30,green,true); codeView.setGravity(Gravity.CENTER); codeView.setPadding(0,dp(8),0,dp(8)); page.addView(codeView);
            LinearLayout row=horizontal();
            Button copy=btn("Copy code"); copy.setOnClickListener(v -> copyShareCode(visibleCode)); row.addView(copy,weight());
            Button newCode=btn("New code"); newCode.setOnClickListener(v -> createShareCode(activeWorld.displayName==null||activeWorld.displayName.trim().isEmpty()?"Player":activeWorld.displayName)); row.addView(newCode,weight());
            page.addView(row);
            paragraph("On the other phone tap Join, enter this 8-character code, then both phones will use this same Minecraft world log.");
        }else{
            paragraph("This world is marked shared, but this phone does not have a saved code yet.");
            Button getCode=btn("Generate share code"); getCode.setOnClickListener(v -> showShareWorld()); page.addView(getCode);
        }
    }

    private void showShareCodeDialog(String code){
        code=ShareCodePresentation.normalizedForDisplay(code);
        if(!JoinCodeUtils.isValid(code)){ showSyncProblem("Share code",new Exception("The server did not return a valid 8-character code.")); return; }
        final String visibleCode=code;
        new AlertDialog.Builder(this).setTitle("Shared World Code")
                .setMessage("Enter this on the second phone:\n\n" + visibleCode + "\n\nTap Join on that phone, enter the code, and both people will log finds in this same world.")
                .setNegativeButton("Done",null)
                .setNeutralButton("New code",(d,w)->createShareCode(activeWorld!=null&&activeWorld.displayName!=null&&!activeWorld.displayName.trim().isEmpty()?activeWorld.displayName:"Player"))
                .setPositiveButton("Copy code",(d,w)->copyShareCode(visibleCode)).show();
    }

    private void showSyncProblem(String stage, Exception error){
        String detail=error==null?"Unknown sync error":error.getMessage(); if(detail==null||detail.trim().isEmpty())detail="Unknown sync error";
        new AlertDialog.Builder(this).setTitle(stage + " failed").setMessage(detail + "\n\nYour local MineFinds data is still saved on this phone.").setPositiveButton("OK",null).show();
    }

    private void showShareWorld(){
        if(activeWorld==null)return;
        String existing=savedShareCode(activeWorld);
        if(ShareCodePresentation.shouldShowSavedCode(activeWorld.shared, existing)){ showShareCodeDialog(existing); return; }
        String currentName=activeWorld.displayName==null?"":activeWorld.displayName.trim();
        if(!currentName.isEmpty()){ createShareCode(currentName); return; }
        askDisplayName("Name shown to other players", this::createShareCode);
    }

    private void createShareCode(String displayName){
        if(activeWorld==null)return;
        final World worldBeingShared=activeWorld; toast("Creating share code…");
        try{
            JSONObject register=new JSONObject(); register.put("op","register");
            sync.call(register,(r,e)->{
                if(e!=null){showSyncProblem("Register this phone",e);return;}
                try{
                    JSONObject create=new JSONObject(); create.put("op","create_world"); create.put("display_name",displayName); create.put("world",sync.worldJson(worldBeingShared));
                    sync.call(create,(cr,ce)->{
                        if(ce!=null){showSyncProblem("Create shared world",ce);return;}
                        db.markWorldShared(worldBeingShared.id,displayName); worldBeingShared.shared=true; worldBeingShared.displayName=displayName;
                        try{
                            JSONObject share=new JSONObject(); share.put("op","share_world"); share.put("world_id",worldBeingShared.cloudUuid);
                            sync.call(share,(sr,se)->{
                                if(se!=null){showSyncProblem("Generate share code",se);return;}
                                String code=ShareCodePresentation.normalizedForDisplay(sr.optString("join_code",""));
                                if(!JoinCodeUtils.isValid(code)){showSyncProblem("Generate share code",new Exception("No valid code was returned."));return;}
                                saveShareCode(worldBeingShared,code); showShareCodeDialog(code); showNearby();
                            });
                        }catch(Exception x){showSyncProblem("Generate share code",x);}
                    });
                }catch(Exception x){showSyncProblem("Create shared world",x);}
            });
        }catch(Exception x){showSyncProblem("Register this phone",x);}
    }

    private void showJoinWorld(){
        LinearLayout box=vertical(dp(12)); EditText code=field("8-character share code"); code.setAllCaps(true); EditText name=field("Your name");
        box.addView(label("JOIN CODE")); box.addView(code); box.addView(label("YOUR NAME")); box.addView(name);
        paragraphInto(box,"Enter the code shown on the first phone. Both phones will then use the same shared world log.");
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Join Shared World").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Join",null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String c=JoinCodeUtils.normalize(code.getText().toString()); String n=name.getText().toString().trim();
            if(!JoinCodeUtils.isValid(c)){toast("Join code must be 8 characters");return;} if(n.isEmpty())n="Player"; final String display=n;
            Button joinButton=dialog.getButton(AlertDialog.BUTTON_POSITIVE); joinButton.setEnabled(false); joinButton.setText("Joining…");
            try{
                JSONObject reg=new JSONObject(); reg.put("op","register");
                sync.call(reg,(rr,re)->{
                    if(re!=null){joinButton.setEnabled(true);joinButton.setText("Join");showSyncProblem("Register this phone",re);return;}
                    try{
                        JSONObject j=new JSONObject(); j.put("op","join_world"); j.put("join_code",c); j.put("display_name",display);
                        sync.call(j,(res,err)->{
                            if(err!=null){joinButton.setEnabled(true);joinButton.setText("Join");showSyncProblem("Join shared world",err);return;}
                            try{
                                String joinedUuid=res.getJSONObject("world").getString("id"); sync.mergeBundle(db,res,display); dialog.dismiss(); toast("Connected to shared world"); refreshWorlds(); selectWorldByCloudUuid(joinedUuid);
                            }catch(Exception x){joinButton.setEnabled(true);joinButton.setText("Join");showSyncProblem("Save shared world",x);}
                        });
                    }catch(Exception x){joinButton.setEnabled(true);joinButton.setText("Join");showSyncProblem("Join shared world",x);}
                });
            }catch(Exception x){joinButton.setEnabled(true);joinButton.setText("Join");showSyncProblem("Register this phone",x);}
        }));
        dialog.show();
    }

    private void paragraphInto(LinearLayout target,String message){ TextView v=tv(message,14,muted,false); v.setPadding(0,dp(6),0,dp(6)); target.addView(v); }

    private void selectWorldByCloudUuid(String cloudUuid){
        if(cloudUuid==null)return;
        for(int i=0;i<worlds.size();i++) if(cloudUuid.equals(worlds.get(i).cloudUuid)){ worldSpinner.setSelection(i); activeWorld=worlds.get(i); showNearby(); return; }
    }

    private void syncActiveWorld(boolean loud){
        if(activeWorld==null||!activeWorld.shared){if(loud)toast("Share this world first");return;}
        if(syncInFlight){if(loud)toast("Sync already running");return;}
        syncInFlight=true; final String worldUuid=activeWorld.cloudUuid; final String display=activeWorld.displayName;
        try{
            JSONObject body=new JSONObject(); body.put("op","sync_world"); body.put("world_id",activeWorld.cloudUuid); body.put("world",sync.worldJson(activeWorld)); body.put("finds",sync.findsJson(db.getAllFindsForSync(activeWorld.id))); body.put("location",sync.locationJson(activeWorld));
            sync.call(body,(res,err)->{
                syncInFlight=false;
                if(err!=null){if(loud)showSyncProblem("Sync shared world",err);else toast("Saved locally • Sync will retry");return;}
                try{sync.mergeBundle(db,res,display); World refreshed=db.getWorldByCloudUuid(worldUuid); if(refreshed!=null)activeWorld=refreshed; if(loud)toast("Shared world synced"); showNearby();}
                catch(Exception x){if(loud)showSyncProblem("Merge shared world",x);}
            });
        }catch(Exception e){syncInFlight=false;if(loud)showSyncProblem("Sync shared world",e);}
    }

'''
s = s[:start] + new_block + s[end:]
p.write_text(s)
