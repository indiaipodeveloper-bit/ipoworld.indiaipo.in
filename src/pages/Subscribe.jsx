import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Page from "../components/Page.jsx";
import { API } from "../api.js";
import indiaIPOLogo from "../assets/ipologo2.png";

const MONTHLY_PRICE = {
  digital: 199,
  hindi_digital: 199,
  print_only: 275,
  print: 349,
};

const DISCOUNT_PCT = { 1: 15, 2: 22, 3: 35 };

const plans = [
  { key: "digital_monthly", label: "Digital only (Monthly)" },
  { key: "digital_annual", label: "Digital only (Annual)" },

  { key: "print_only_monthly", label: "Print only (Monthly)" },
  { key: "print_only_annual", label: "Print only (Annual)" },

  { key: "print_monthly", label: "Digital + Print (Monthly)" },
  { key: "print_annual", label: "Digital + Print (Annual)" },

  { key: "hindi_digital_monthly", label: "Hindi Digital only (Monthly)" },
  { key: "hindi_digital_annual", label: "Hindi Digital only (Annual)" },
];

const PLAN_LABEL = Object.fromEntries(plans.map((p) => [p.key, p.label]));
const fmt = new Intl.NumberFormat("en-IN");

function planTypeFromKey(k) {
  if (k.startsWith("hindi_digital")) return "hindi_digital";
  if (k.startsWith("print_only")) return "print_only";
  if (k.startsWith("print_")) return "print";
  return "digital";
}

function tabFromKey(k) {
  return k.startsWith("hindi_") ? "hindi" : "english";
}

const ENGLISH_PLANS = plans.filter((p) => !p.key.startsWith("hindi_"));
const HINDI_PLANS = plans.filter((p) => p.key.startsWith("hindi_"));

const PRIMARY_RECOMMENDED = {
  english: "print_annual",
  hindi: "hindi_digital_annual",
};

export default function Subscribe() {
  const nav = useNavigate();
  const [planKey, setPlanKey] = useState("digital_annual");
  const [termYears, setTermYears] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rzpReady, setRzpReady] = useState(!!window.Razorpay);
  const [address, setAddress] = useState({
    name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [me, setMe] = useState(null);
  const [activeTab, setActiveTab] = useState("english");
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);

  const isActiveStatus = (status) =>
    typeof status === "string" && status.toLowerCase() === "active";

  const isAnnual = planKey.endsWith("_annual");
  const needsAddress = planKey.startsWith("print_");
  const hasActive = isActiveStatus(me?.subscriptionStatus);
  const isCurrentSelected = hasActive && me?.planKey === planKey;

  const adsConvFiredRef = useRef(false);
  const rzpStartedRef = useRef(false);

  useEffect(() => {
    if (adsConvFiredRef.current) return;
    adsConvFiredRef.current = true;
    try {
      if (typeof window !== "undefined" && typeof window.gtag === "function") {
        window.gtag("event", "conversion", {
          send_to: "AW-16865507345/VSxgCMvO_KcbEJHwjOo-",
        });
      } else if (typeof window !== "undefined") {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: "ads_conversion_subscribe",
          send_to: "AW-16865507345/VSxgCMvO_KcbEJHwjOo-",
          page_path: "/subscribe",
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!window.Razorpay) {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => setRzpReady(true);
      s.onerror = () => setErr("Failed to load Razorpay");
      document.body.appendChild(s);
    } else {
      setRzpReady(true);
    }

    API.get("/auth/me")
      .then(({ data }) => {
        setMe(data);
        if (
          isActiveStatus(data.subscriptionStatus) &&
          data.planKey &&
          data.planKey.endsWith("_annual")
        ) {
          setPlanKey(data.planKey);
          setActiveTab(tabFromKey(data.planKey));
          setTermYears(1);
        } else {
          setActiveTab(tabFromKey("digital_annual"));
          setPlanKey(PRIMARY_RECOMMENDED.english);
          setTermYears(1);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!needsAddress) setShowAddressForm(false);
  }, [needsAddress]);

  const validateAddress = () => {
    if (!needsAddress) return true;
    const required = ["name", "phone", "line1", "city", "state", "pincode"];
    const missing = required.filter((k) => !address[k]?.trim());
    if (missing.length) {
      setErr("Please fill: " + missing.join(", "));
      setShowAddressForm(true);
      return false;
    }
    return true;
  };

  const type = planTypeFromKey(planKey);

  const compareAt = useMemo(() => {
    if (!isAnnual) return null;
    return 12 * MONTHLY_PRICE[type] * termYears;
  }, [isAnnual, type, termYears]);

  const actualTotal = useMemo(() => {
    if (!isAnnual) return null;
    const pct = DISCOUNT_PCT[termYears] || 0;
    const base = 12 * MONTHLY_PRICE[type] * termYears;
    return Math.round(base * (1 - pct / 100));
  }, [isAnnual, type, termYears]);

  const monthlyEquivalent = useMemo(() => {
    if (!isAnnual) return null;
    const total = actualTotal || 0;
    const months = termYears * 12;
    return months ? Math.round(total / months) : null;
  }, [isAnnual, actualTotal, termYears]);

  const startOneTime = async () => {
    const payload = { planKey, years: termYears };
    if (needsAddress) payload.address = address;
    const { data } = await API.post("/pay/create-order", payload);

    try {
      if (!rzpStartedRef.current) {
        rzpStartedRef.current = true;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: "begin_checkout",
          page_path: "/subscribe",
          planKey,
          termYears,
          mode: "one_time",
        });
      }
    } catch {}

    const rzp = new window.Razorpay({
      key: data.key,
      order_id: data.orderId,
      name: "India IPO Magazine",
      description: `${termYears}-Year Access`,
      handler: function (response) {
        API.post("/pay/confirm", {
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        })
          .then(() => {
            try {
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({
                event: "purchase",
                page_path: "/subscribe",
                planKey,
                termYears,
                mode: "one_time",
              });
            } catch {}
            nav("/library");
          })
          .catch((e) => {
            const msg =
              e?.response?.data?.error ||
              e?.message ||
              "Failed to confirm payment";
            setErr(msg);
          });
      },
      theme: { color: "#111827" },
      modal: {
        ondismiss: () => {
          setErr("");
          setPlanKey(me?.planKey || planKey);
          setActiveTab(tabFromKey(me?.planKey || planKey));
        },
      },
    });

    rzp.on("payment.failed", (resp) => {
      setErr(resp?.error?.description || "Payment failed");
      setPlanKey(me?.planKey || planKey);
      setActiveTab(tabFromKey(me?.planKey || planKey));
    });

    rzp.open();
  };

  const startSubscription = async () => {
    const payload = { planKey };
    if (needsAddress) payload.address = address;
    const { data } = await API.post("/pay/create-subscription", payload);

    try {
      if (!rzpStartedRef.current) {
        rzpStartedRef.current = true;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: "begin_checkout",
          page_path: "/subscribe",
          planKey,
          termYears: 1,
          mode: "recurring",
        });
      }
    } catch {}

    const rzp = new window.Razorpay({
      key: data.key,
      subscription_id: data.subscriptionId,
      name: "India IPO Magazine",
      description: PLAN_LABEL[planKey] || "Subscription",
      handler: function (response) {
        API.post("/pay/activate", {
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_subscription_id: response.razorpay_subscription_id,
          razorpay_signature: response.razorpay_signature,
        })
          .then(() => {
            try {
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({
                event: "purchase",
                page_path: "/subscribe",
                planKey,
                termYears: 1,
                mode: "recurring",
              });
            } catch {}
            nav("/library");
          })
          .catch((e) => {
            const msg =
              e?.response?.data?.error ||
              e?.message ||
              "Failed to activate subscription";
            setErr(msg);
          });
      },
      theme: { color: "#111827" },
      modal: {
        ondismiss: () => {
          setErr("");
        },
      },
    });

    rzp.open();
  };

  const pay = async () => {
    setErr("");
    if (!rzpReady) {
      setErr("Payment is initializing. Please try again in a second.");
      return;
    }
    if (!validateAddress()) return;
    setLoading(true);
    try {
      if (isAnnual) {
        await startOneTime();
      } else {
        await startSubscription();
      }
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to start payment");
    } finally {
      setLoading(false);
    }
  };

  const addrField = (k, p, t = "text") => (
    <input
      className="input"
      type={t}
      placeholder={p}
      value={address[k]}
      onChange={(e) => setAddress({ ...address, [k]: e.target.value })}
      required={needsAddress}
      inputMode={k === "phone" || k === "pincode" ? "numeric" : undefined}
      autoComplete={
        k === "name"
          ? "name"
          : k === "phone"
          ? "tel"
          : k === "line1"
          ? "address-line1"
          : k === "line2"
          ? "address-line2"
          : k === "city"
          ? "address-level2"
          : k === "state"
          ? "address-level1"
          : k === "pincode"
          ? "postal-code"
          : undefined
      }
    />
  );

  const shownPlans = activeTab === "hindi" ? HINDI_PLANS : ENGLISH_PLANS;

  const onSwitchTab = (tab) => {
    setActiveTab(tab);
    const isHindi = tab === "hindi";
    const validKeys = (isHindi ? HINDI_PLANS : ENGLISH_PLANS).map((p) => p.key);
    if (!validKeys.includes(planKey)) {
      const fallback = isHindi ? "hindi_digital_annual" : "digital_annual";
      setPlanKey(fallback);
      setTermYears(1);
    }
  };

  const recommendedKey =
    activeTab === "hindi"
      ? PRIMARY_RECOMMENDED.hindi
      : PRIMARY_RECOMMENDED.english;

  const orderedPlans = useMemo(() => {
    const arr = [...shownPlans];
    arr.sort((a, b) => {
      const aScore =
        a.key === recommendedKey ? 0 : a.key.endsWith("_annual") ? 1 : 2;
      const bScore =
        b.key === recommendedKey ? 0 : b.key.endsWith("_annual") ? 1 : 2;
      return aScore - bScore;
    });
    return arr;
  }, [shownPlans, recommendedKey]);

  const visiblePlans = useMemo(() => {
    if (showAllPlans) return orderedPlans;
    return orderedPlans.slice(0, 2);
  }, [orderedPlans, showAllPlans, orderedPlans]);

  const setPlanAndTab = (key) => {
    setPlanKey(key);
    if (key.endsWith("_annual")) setTermYears(1);
    const nextTab = tabFromKey(key);
    if (nextTab !== activeTab) setActiveTab(nextTab);
  };

  const selectedTitle = PLAN_LABEL[planKey] || "Subscription";

  const priceLine = useMemo(() => {
    if (!isAnnual) {
      return `₹${fmt.format(MONTHLY_PRICE[type] || 0)}/month`;
    }
    return `₹${fmt.format(actualTotal || 0)} / ${termYears} year${
      termYears > 1 ? "s" : ""
    }`;
  }, [isAnnual, type, actualTotal, termYears]);

  const subLine = useMemo(() => {
    if (!isAnnual) return "Cancel anytime • Instant access";
    return `~₹${fmt.format(monthlyEquivalent || 0)}/month • Save ${
      DISCOUNT_PCT[termYears] || 0
    }%`;
  }, [isAnnual, monthlyEquivalent, termYears]);

  const ctaLabel = useMemo(() => {
    if (!isAnnual) return "Start Subscription →";
    return `Get Instant Access →`;
  }, [isAnnual]);

  return (
    <Page
      title={
        <div className="flex my-4 gap-x-4 items-center">
          <img src={indiaIPOLogo} alt="" className="h-[56px] w-[56px]" />
          <div className="flex flex-col leading-tight">
            <p className="font-bold text-lg md:text-2xl">IPO World Magazine</p>
            <p className="text-slate-600 text-xs md:text-sm">
              Research-backed IPO insights • Monthly issues
            </p>
          </div>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-5xl pb-24 md:pb-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-base md:text-lg">
                    Choose your plan
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Secure Razorpay checkout • Instant access
                  </div>
                </div>

                {hasActive && (
                  <div className="hidden md:block rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs">
                    <span className="font-semibold">Active:</span>{" "}
                    {PLAN_LABEL[me?.planKey] || "—"}
                  </div>
                )}
              </div>

              <div className="mt-3 flex w-full rounded-full border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => onSwitchTab("english")}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs md:text-sm font-semibold ${
                    activeTab === "english"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchTab("hindi")}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs md:text-sm font-semibold ${
                    activeTab === "hindi"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  हिंदी
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Recommended plan is highlighted.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPlanAndTab(recommendedKey);
                      setShowAllPlans(true);
                    }}
                    className="text-xs md:text-sm font-semibold text-slate-900 hover:underline"
                  >
                    Recommended →
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllPlans((v) => !v)}
                    className="text-xs md:text-sm font-semibold text-slate-900 hover:underline"
                  >
                    {showAllPlans ? "Show less" : "Compare all"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {(showAllPlans ? orderedPlans : visiblePlans).map((p) => {
                  const selected = planKey === p.key;
                  const isThisAnnual = p.key.endsWith("_annual");
                  const thisType = planTypeFromKey(p.key);
                  const isRecommended = p.key === recommendedKey;
                  const isUserCurrentPlan = p.key === me?.planKey;

                  const cardTerm = isThisAnnual ? termYears : 1;

                  let cardCompareAt = null;
                  let cardActual = null;
                  let cardDiscount = "";

                  if (isThisAnnual) {
                    const base = 12 * MONTHLY_PRICE[thisType] * cardTerm;
                    const disc = DISCOUNT_PCT[cardTerm] || 0;
                    cardCompareAt = base;
                    cardActual = Math.round(base * (1 - disc / 100));
                    cardDiscount = disc ? `Save ${disc}%` : "";
                  } else {
                    cardActual = MONTHLY_PRICE[thisType];
                  }

                  return (
                    <label
                      key={p.key}
                      className={`cursor-pointer rounded-xl p-3 transition border ${
                        selected
                          ? "border-slate-900 shadow"
                          : "border-slate-200 hover:shadow-sm"
                      } ${isRecommended ? "bg-slate-50" : "bg-white"} ${
                        isUserCurrentPlan ? "ring-1 ring-green-500/30" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="plan"
                          className="mt-1"
                          checked={selected}
                          onChange={() => setPlanAndTab(p.key)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-sm">
                              {p.label}
                            </div>
                            {isRecommended && (
                              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                                Recommended
                              </span>
                            )}
                          </div>

                          {isThisAnnual ? (
                            <div className="mt-1 text-xs">
                              <span className="line-through mr-2 text-slate-500">
                                ₹{fmt.format(cardCompareAt || 0)}
                              </span>
                              <span className="font-semibold">
                                ₹{fmt.format(cardActual || 0)}
                              </span>{" "}
                              <span className="text-slate-600">
                                / {cardTerm > 1 ? `${cardTerm} yrs` : "yr"}
                              </span>
                              {cardDiscount && (
                                <span className="ml-2 text-green-700 font-semibold">
                                  {cardDiscount}
                                </span>
                              )}
                              <div className="text-slate-500 mt-0.5">
                                ~₹
                                {fmt.format(
                                  Math.round((cardActual || 0) / (cardTerm * 12))
                                )}
                                /month
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-700">
                              <span className="font-semibold">
                                ₹{fmt.format(cardActual || 0)}
                              </span>{" "}
                              / month{" "}
                              <span className="text-slate-500">• Cancel anytime</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {isAnnual && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-600">
                    Tenure (bigger savings on longer plans)
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3].map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setTermYears(y)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          termYears === y
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 hover:bg-white"
                        }`}
                      >
                        {y}y ({DISCOUNT_PCT[y]}%)
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {needsAddress && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">Delivery details</div>
                    <div className="text-xs text-slate-600">
                      Required only for print delivery.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddressForm((v) => !v)}
                    className="text-xs md:text-sm font-semibold text-slate-900 hover:underline"
                  >
                    {showAddressForm ? "Hide" : "Add address →"}
                  </button>
                </div>

                {showAddressForm && (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {addrField("name", "Full name")}
                    {addrField("phone", "Phone")}
                    {addrField("line1", "Address line 1")}
                    {addrField("line2", "Address line 2 (optional)")}
                    {addrField("city", "City")}
                    {addrField("state", "State")}
                    {addrField("pincode", "Pincode")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="md:sticky md:top-3 h-fit">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-600">Selected plan</div>
              <div className="mt-1 font-semibold text-sm">{selectedTitle}</div>

              <div className="mt-2 flex items-baseline justify-between gap-2">
                <div className="text-base font-semibold text-slate-900">
                  {priceLine}
                </div>
                {isAnnual && (
                  <div className="text-xs text-slate-500 line-through">
                    ₹{fmt.format(compareAt || 0)}
                  </div>
                )}
              </div>

              <div className="mt-1 text-xs text-slate-600">{subLine}</div>

              <div className="mt-3 text-xs text-slate-600">
                ✔ Monthly magazine issues
                <br />
                ✔ Secure Razorpay payment
                <br />
                ✔ Instant access after payment
                {needsAddress ? (
                  <>
                    <br />✔ Print delivery included
                  </>
                ) : null}
              </div>

              {err && <div className="mt-3 text-red-600 text-sm">{err}</div>}

              <div className="mt-4 flex flex-col gap-2">
                <button
                  className="btn w-full"
                  onClick={pay}
                  disabled={
                    loading ||
                    !rzpReady ||
                    (isAnnual && isCurrentSelected && termYears === 1)
                  }
                >
                  {loading ? "Starting…" : ctaLabel}
                </button>

                {hasActive && (
                  <button
                    type="button"
                    onClick={() => nav("/library")}
                    className="btn-secondary w-full"
                  >
                    Go to Library
                  </button>
                )}

                <div className="text-[11px] text-slate-500">
                  By continuing, you agree to the plan terms.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed left-0 right-0 bottom-0 z-40 border-t border-slate-200 bg-white md:hidden">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-slate-600 truncate">{selectedTitle}</div>
              <div className="text-sm font-semibold text-slate-900">
                {isAnnual ? `₹${fmt.format(actualTotal || 0)}` : `₹${fmt.format(MONTHLY_PRICE[type] || 0)}/mo`}
              </div>
            </div>
            <button
              className="btn"
              onClick={pay}
              disabled={
                loading ||
                !rzpReady ||
                (isAnnual && isCurrentSelected && termYears === 1)
              }
            >
              {loading ? "Starting…" : "Pay →"}
            </button>
          </div>
        </div>
      </div>
    </Page>
  );
}