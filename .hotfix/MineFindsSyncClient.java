package com.hailey.minefinds;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MineFindsSyncClient {
    public interface Callback { void done(JSONObject result, Exception error); }
    private static final String ENDPOINT="https://jytglrhvkzbsfpizjtrp.supabase.co/functions/v1/minefinds-sync";
    private final Activity activity;
    private final DeviceIdentity identity;
    private final ExecutorService exec=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());

    public MineFindsSyncClient(Activity activity){this.activity=activity;this.identity=DeviceIdentity.get(activity);}
    public String deviceId(){return identity.id();}

    public void call(JSONObject body, Callback cb){
        exec.execute(() -> {
            JSONObject result=null; Exception error=null;
            try{
                HttpURLConnection c=(HttpURLConnection)new URL(ENDPOINT).openConnection();
                c.setConnectTimeout(12000);c.setReadTimeout(18000);c.setRequestMethod("POST");c.setDoOutput(true);
                c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("X-MineFinds-Device",identity.id());c.setRequestProperty("X-MineFinds-Secret",identity.secret());
                byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);
                try(OutputStream out=c.getOutputStream()){out.write(bytes);}
                int code=c.getResponseCode();InputStream in=code>=200&&code<400?c.getInputStream():c.getErrorStream();
                StringBuilder s=new StringBuilder();if(in!=null){try(BufferedReader r=new BufferedReader(new InputStreamReader(in,StandardCharsets.UTF_8))){String line;while((line=r.readLine())!=null)s.append(line);}}
                result=s.length()==0?new JSONObject():new JSONObject(s.toString());
                if(code<200||code>=300||!result.optBoolean("ok",false))throw new Exception(result.optString("error","Sync failed ("+code+")"));
            }catch(Exception e){error=e;}
            JSONObject rr=result;Exception ee=error;main.post(() -> cb.done(rr,ee));
        });
    }

    public JSONObject worldJson(World w)throws Exception{JSONObject o=new JSONObject();o.put("id",w.cloudUuid);o.put("name",w.name);o.put("seed",w.seed);o.put("edition",w.edition);o.put("minecraft_version",w.version);o.put("dimension",w.dimension);o.put("created_at",w.createdAt);o.put("updated_at",w.updatedAt);if(w.deletedAt!=null)o.put("deleted_at",w.deletedAt);else o.put("deleted_at",JSONObject.NULL);return o;}
    public JSONArray findsJson(List<FindItem> finds)throws Exception{JSONArray a=new JSONArray();for(FindItem f:finds){JSONObject o=new JSONObject();o.put("id",f.cloudUuid);o.put("name",f.name);o.put("category",f.category);o.put("x",f.x);o.put("y",f.y);o.put("z",f.z);o.put("notes",f.notes==null?"":f.notes);o.put("created_at",f.createdAt);o.put("updated_at",f.updatedAt);if(f.deletedAt==null)o.put("deleted_at",JSONObject.NULL);else o.put("deleted_at",f.deletedAt);if(f.createdBy!=null)o.put("created_by",f.createdBy);a.put(o);}return a;}
    public JSONObject locationJson(World w)throws Exception{JSONObject o=new JSONObject();o.put("x",w.currentX);o.put("y",w.currentY);o.put("z",w.currentZ);o.put("updated_at",System.currentTimeMillis());return o;}

    public void mergeBundle(DatabaseHelper db, JSONObject result, String displayName)throws Exception{
        JSONObject w=result.getJSONObject("world");String uuid=w.getString("id");
        long localId=db.upsertCloudWorld(uuid,w.getString("name"),w.getString("seed"),w.getString("edition"),w.getString("minecraft_version"),w.getString("dimension"),w.getLong("created_at"),w.getLong("updated_at"),displayName);
        JSONArray fs=result.optJSONArray("finds");if(fs!=null){for(int i=0;i<fs.length();i++){JSONObject f=fs.getJSONObject(i);Long deleted=f.isNull("deleted_at")?null:f.getLong("deleted_at");db.upsertCloudFind(localId,f.getString("id"),f.getString("name"),f.getString("category"),f.getInt("x"),f.getInt("y"),f.getInt("z"),f.optString("notes",""),f.getLong("created_at"),f.getLong("updated_at"),deleted,f.optString("created_by",null),f.optString("updated_by",null));}}
        JSONArray ps=result.optJSONArray("players");List<PlayerLocation> players=new ArrayList<>();if(ps!=null){for(int i=0;i<ps.length();i++){JSONObject p=ps.getJSONObject(i),loc=p.optJSONObject("location");if(loc==null)continue;PlayerLocation pl=new PlayerLocation();pl.deviceId=p.getString("device_id");pl.displayName=p.optString("display_name","Player");pl.x=loc.getInt("x");pl.y=loc.getInt("y");pl.z=loc.getInt("z");pl.updatedAt=loc.getLong("updated_at");players.add(pl);}}db.replacePlayers(localId,players);
    }
}
