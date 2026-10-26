import numpy as np
import matplotlib.pyplot as plt

# -----------------------
# Hill equation
# -----------------------
def hill(x, Emax, EC50, n):
    return Emax * (x**n / (EC50**n + x**n))

# -----------------------
# Tremor model parameters (YOUR FIT)
# -----------------------
Emax_tremor = 76.66
EC50_tremor = 255.22
n_tremor = 1.55

# Vibrotactile stimulation effect
vts_reduction = 45.49

# Target tremor reduction
target_reduction = 50

# -----------------------
# BP side-effect parameters
# -----------------------
Emax_BP = 45
EC50_BP = 110
n_BP = 1.6

# -----------------------
# Estimate dose function
# -----------------------
def estimate_dose(target, Emax, EC50, n):

    x = np.linspace(0,900,10000)
    y = hill(x,Emax,EC50,n)

    idx = np.argmin(np.abs(y-target))

    return x[idx]

# -----------------------
# Dose WITHOUT VTS
# -----------------------
dose_without_vts = estimate_dose(
    target_reduction,
    Emax_tremor,
    EC50_tremor,
    n_tremor
)

# -----------------------
# Drug reduction needed WITH VTS
# -----------------------
drug_needed = max(target_reduction - vts_reduction,0)

dose_with_vts = estimate_dose(
    drug_needed,
    Emax_tremor,
    EC50_tremor,
    n_tremor
)

# -----------------------
# BP side effects
# -----------------------
bp_without_vts = hill(
    dose_without_vts,
    Emax_BP,
    EC50_BP,
    n_BP
)

bp_with_vts = hill(
    dose_with_vts,
    Emax_BP,
    EC50_BP,
    n_BP
)

# -----------------------
# Generate curves
# -----------------------
x = np.linspace(0,900,900)

tremor_curve = hill(x,Emax_tremor,EC50_tremor,n_tremor)
bp_curve = hill(x,Emax_BP,EC50_BP,n_BP)

# -----------------------
# Tremor graph
# -----------------------
plt.figure()

plt.plot(x,tremor_curve,label="Propranolol Tremor Response")

plt.axhline(target_reduction,linestyle="--",label="Target Tremor Reduction")

plt.axvline(dose_without_vts,linestyle=":",label="Dose without VTS")

plt.axvline(dose_with_vts,linestyle=":",label="Dose with VTS")

plt.xlabel("Dose (mg)")
plt.ylabel("% Tremor Reduction")
plt.title("Dose Required to Reach Target Tremor Reduction")

plt.legend()
plt.grid(True)
plt.show()

# -----------------------
# BP side-effect graph
# -----------------------
plt.figure()

plt.plot(x,bp_curve,label="Blood Pressure Reduction")

plt.scatter(dose_without_vts,bp_without_vts,label="Without VTS")
plt.scatter(dose_with_vts,bp_with_vts,label="With VTS")

plt.xlabel("Dose (mg)")
plt.ylabel("% Blood Pressure Reduction")
plt.title("Side-Effect Comparison")

plt.legend()
plt.grid(True)
plt.show()

# -----------------------
# Results
# -----------------------
print("Target Tremor Reduction:",target_reduction,"%")

print("\nWithout VTS")
print("Dose required:",round(dose_without_vts,2),"mg")
print("BP reduction:",round(bp_without_vts,2),"%")

print("\nWith VTS")
print("Dose required:",round(dose_with_vts,2),"mg")
print("BP reduction:",round(bp_with_vts,2),"%")

print("\nDose reduction from VTS:",round(dose_without_vts-dose_with_vts,2),"mg")