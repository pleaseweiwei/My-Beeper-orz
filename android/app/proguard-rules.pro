# Add project specific ProGuard rules here.
-keep class com.beeper.floatpet.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
