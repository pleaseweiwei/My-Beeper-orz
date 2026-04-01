# FloatPet ProGuard Rules

# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep all classes in our package
-keep class com.beeper.floatpet.** { *; }

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# OkHttp / networking
-dontwarn okhttp3.**
-dontwarn okio.**

# JSON
-keep class org.json.** { *; }
