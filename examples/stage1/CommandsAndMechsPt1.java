void main() {}

// [mechanismDef]
class Intake implements Mechanism {
  // Store any motors specific to the mechanism as private members.
  // This can include TalonFX, SparkMax and/or SparkFlex instances.
  private final ExampleMotor motor = new ExampleMotor();
}
// [/mechanismDef]

// [mechanismInRobotDef]
class Robot {
  private final Intake intake = new Intake();
}
// [/mechanismInRobotDef]

class ExampleCommands implements Mechanism {
  public ExampleCommands() {
    var exampleCommand = 
      // [commandDef]
      run(coroutine -> {
        System.out.println("Full Speed Baby!");
        while (true) {
          motor.setThrottle(1.0);
          coroutine.yield();
        }
      })
        .named("Set to Full Throttle");
      // [/commandDef]
    
    var exampleCommandWithPriority = 
      // [commandWithPriorityDef]
      run(coroutine -> {
        System.out.println("Full Speed Baby!");
        while (true) {
          motor.setThrottle(1.0);
          coroutine.yield();
        }
      })
        .withPriority(1) // recall that the default priority is 0.
        .named("Set to Full Throttle");  
      // [/commandWithPriorityDef]
  }
}

class ExampleMotor {}
