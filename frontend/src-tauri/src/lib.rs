use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
struct Pooja {
    id: Option<String>,
    name: String,
    description: String,
    amount: f64,
    duration_minutes: i64,
    category: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Booking {
    id: Option<String>,
    devotee_name: String,
    phone_number: String,
    address: String,
    star: String,
    nakshatra: String,
    date: String,
    time: String,
    remarks: String,
    pooja_name: String,
    amount: f64,
    payment_mode: String,
    status: String,
    created_at: Option<i64>,
}

fn connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db = Connection::open(dir.join("temple-erp.db")).map_err(|e| e.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS poojas (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            duration_minutes INTEGER NOT NULL,
            category TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bookings (
            id TEXT PRIMARY KEY,
            devotee_name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            address TEXT NOT NULL,
            star TEXT NOT NULL,
            nakshatra TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            remarks TEXT NOT NULL,
            pooja_name TEXT NOT NULL,
            amount REAL NOT NULL,
            payment_mode TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(db)
}

#[tauri::command]
fn db_list_poojas(app: tauri::AppHandle) -> Result<Vec<Pooja>, String> {
    let db = connection(&app)?;
    let mut stmt = db
        .prepare("SELECT id,name,description,amount,duration_minutes,category FROM poojas ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Pooja {
                id: Some(r.get(0)?),
                name: r.get(1)?,
                description: r.get(2)?,
                amount: r.get(3)?,
                duration_minutes: r.get(4)?,
                category: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let poojas = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(poojas)
}

#[tauri::command]
fn db_save_pooja(app: tauri::AppHandle, pooja: Pooja) -> Result<Pooja, String> {
    let db = connection(&app)?;
    let id = pooja
        .id
        .clone()
        .unwrap_or_else(|| format!("pooja-{}", chrono_like_now()));
    db.execute(
        "INSERT INTO poojas (id,name,description,amount,duration_minutes,category)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           description=excluded.description,
           amount=excluded.amount,
           duration_minutes=excluded.duration_minutes,
           category=excluded.category",
        params![
            &id,
            &pooja.name,
            &pooja.description,
            pooja.amount,
            pooja.duration_minutes,
            &pooja.category
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(Pooja {
        id: Some(id),
        ..pooja
    })
}

#[tauri::command]
fn db_delete_pooja(app: tauri::AppHandle, id: String) -> Result<(), String> {
    connection(&app)?
        .execute("DELETE FROM poojas WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_list_bookings(app: tauri::AppHandle) -> Result<Vec<Booking>, String> {
    let db = connection(&app)?;
    let mut stmt = db
        .prepare(
            "SELECT id,devotee_name,phone_number,address,star,nakshatra,date,time,remarks,pooja_name,amount,payment_mode,status,created_at
             FROM bookings ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Booking {
                id: Some(r.get(0)?),
                devotee_name: r.get(1)?,
                phone_number: r.get(2)?,
                address: r.get(3)?,
                star: r.get(4)?,
                nakshatra: r.get(5)?,
                date: r.get(6)?,
                time: r.get(7)?,
                remarks: r.get(8)?,
                pooja_name: r.get(9)?,
                amount: r.get(10)?,
                payment_mode: r.get(11)?,
                status: r.get(12)?,
                created_at: Some(r.get(13)?),
            })
        })
        .map_err(|e| e.to_string())?;
    let bookings = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(bookings)
}

#[tauri::command]
fn db_save_booking(app: tauri::AppHandle, booking: Booking) -> Result<Booking, String> {
    let db = connection(&app)?;
    let id = booking
        .id
        .clone()
        .unwrap_or_else(|| format!("booking-{}", chrono_like_now()));
    let created_at = booking.created_at.unwrap_or_else(chrono_like_now);
    db.execute(
        "INSERT INTO bookings (
            id,devotee_name,phone_number,address,star,nakshatra,date,time,remarks,pooja_name,amount,payment_mode,status,created_at
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status",
        params![
            &id,
            &booking.devotee_name,
            &booking.phone_number,
            &booking.address,
            &booking.star,
            &booking.nakshatra,
            &booking.date,
            &booking.time,
            &booking.remarks,
            &booking.pooja_name,
            booking.amount,
            &booking.payment_mode,
            &booking.status,
            created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(Booking {
        id: Some(id),
        created_at: Some(created_at),
        ..booking
    })
}

#[tauri::command]
fn db_update_booking_status(app: tauri::AppHandle, id: String, status: String) -> Result<(), String> {
    connection(&app)?
        .execute("UPDATE bookings SET status=?1 WHERE id=?2", params![status, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_delete_booking(app: tauri::AppHandle, id: String) -> Result<(), String> {
    connection(&app)?
        .execute("DELETE FROM bookings WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn db_get_opening_balance(app: tauri::AppHandle) -> Result<f64, String> {
    let db = connection(&app)?;
    Ok(db
        .query_row("SELECT value FROM settings WHERE key='opening_balance'", [], |r| {
            r.get::<_, String>(0)
        })
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0))
}

#[tauri::command]
fn db_set_opening_balance(app: tauri::AppHandle, opening_balance: f64) -> Result<(), String> {
    connection(&app)?
        .execute(
            "INSERT INTO settings (key,value) VALUES ('opening_balance',?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [opening_balance.to_string()],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn chrono_like_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            db_list_poojas,
            db_save_pooja,
            db_delete_pooja,
            db_list_bookings,
            db_save_booking,
            db_update_booking_status,
            db_delete_booking,
            db_get_opening_balance,
            db_set_opening_balance
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
