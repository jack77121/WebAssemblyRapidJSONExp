#include "json_handler.h"

MyContract::MyContract(const std::string& temp){
    const char* inpuJSON = temp.c_str();
    _myJSONDoc.Parse(inpuJSON);
    // Name
    if(_myJSONDoc.HasMember(NAME)) {
        _name = &_myJSONDoc[NAME];    
    }
    else{
        _name = nullptr;
    }
    // TotalSupply
    if(_myJSONDoc.HasMember(TOTAL_SUP)) {
        _total_supply = &_myJSONDoc[TOTAL_SUP];    
    }
    else{
        _total_supply = nullptr;
    }
    // OwnerAddress
    if(_myJSONDoc.HasMember(OWNER_ADDR)) {
        _ownerAddr = &_myJSONDoc[OWNER_ADDR];    
    }
    else{
        _ownerAddr = nullptr;
    }
    // Hash
    if(_myJSONDoc.HasMember(CONTRACT_HASH)) {
        _hash = &_myJSONDoc[CONTRACT_HASH];    
    }
    else{
        _hash = nullptr;
    }
    // Mapping
    if(_myJSONDoc.HasMember(MAP)) {
        _mapping = &_myJSONDoc[MAP];    
    }
    else{
        _mapping = nullptr;
    }
    // id
    if(_myJSONDoc.HasMember(ID)) {
        _id = &_myJSONDoc[ID];    
    }
    else{
        _id = nullptr;
    }
}


std::string MyContract::GetName() {
    std::string tempName = _name->GetString();
    return tempName;
}

int MyContract::GetSupply() {
    int tempSup = _total_supply->GetInt();
    return tempSup;
}

int MyContract::GetBalance(const std::string& findName) {
    if(_mapping->HasMember(findName.c_str())) {
        int valueOfName = (*_mapping)[findName.c_str()].GetInt();
        return valueOfName;
    }
    else {
        return VALUE_NOT_FOUND;
    }
     
}
// JSON array
// int MyContract::GetMap2(const std::string& findName) {
//     for (Value::ConstValueIterator arrayitr = _map2->Begin(); arrayitr != _map2->End(); ++arrayitr) {

//         if(arrayitr->HasMember(findName.c_str())) {
//             return (*arrayitr)[findName.c_str()].GetInt();
//         }
//     }
//     return VALUE_NOT_FOUND;
// }

std::string MyContract::GetMyContract() {
    StringBuffer buffer;
    Writer<StringBuffer> writer(buffer);
    _myJSONDoc.Accept(writer);
    const char* tempJson = buffer.GetString();
    std::string myJSON(tempJson);
    return myJSON;
}

void MyContract::SetName(const std::string& changeName) {
    _name->SetString(changeName.c_str(), _myJSONDoc.GetAllocator());
}

void MyContract::SetSupply(const int& changeSupply) {
    _total_supply->SetInt(changeSupply);
}

/**
 * Add_KeyInt - Add a key, integer pair into your current JSON object (MyContract)
 * Add_KeyInt - Add a key, string pair into your current JSON object (MyContract)
 * These two function might merge into one function in the "future" XD
*/
void MyContract::Add_KeyInt(const std::string& name, const int& value) {
    Value intObject(kNumberType); 
    Value strObject;
    strObject.SetString(name.c_str(), name.size(), _myJSONDoc.GetAllocator());
    intObject.SetInt(value);
    _myJSONDoc.AddMember(strObject, intObject, _myJSONDoc.GetAllocator());
}

void MyContract::Add_KeyString(const std::string& name2, const std::string& str_value) {
    Value nameObj(kStringType);
    Value strValueObj(kStringType);
    nameObj.SetString(name2.c_str(), name2.size(), _myJSONDoc.GetAllocator());
    strValueObj.SetString(str_value.c_str(), str_value.size(), _myJSONDoc.GetAllocator());
    _myJSONDoc.AddMember(nameObj, strValueObj, _myJSONDoc.GetAllocator());
}



// void MyContract::Add_MemberIntoArray(const std::string& arrayKey, const std::string& insertKey, const std::string& insertValue) {
//     Value& targetArray = _myJSONDoc["map2"];
    
//     targetArray.PushBack("test", "test1", _myJSONDoc.GetAllocator());
// }


/**
 * TransferCoin_A2B - Transfer Coin from A to B
 * Input:   (A's address, B's address, Transfer amount)
 * Output:  Current contract state in JSON format
*/ 
std::string MyContract::Transfer(const std::string& A, const std::string& B, const int& transferValue) {
    if(transferValue <= 0) {
        return INVALID_AMOUNT;
    }
    if((*_mapping).HasMember(A.c_str())) {
        // if Address A exist
        if((*_mapping)[A.c_str()].GetInt() < transferValue) {
            // if A's balance is not enough
            return INSUFFICIENT_BALANCE;
        }
        if((*_mapping).HasMember(B.c_str())) {
            // if Address B exist, Change B's balance
            (*_mapping)[B.c_str()].SetInt((*_mapping)[B.c_str()].GetInt()+transferValue);
        }
        else {
            // if Address B doesn't exist, set a new one
            Value intObject(kNumberType); 
            Value strObject;
            strObject.SetString(B.c_str(), B.size(), _myJSONDoc.GetAllocator());
            intObject.SetInt(transferValue);
            _mapping->AddMember(strObject, intObject, _myJSONDoc.GetAllocator());
        }
        // Change A's balance
        (*_mapping)[A.c_str()].SetInt((*_mapping)[A.c_str()].GetInt()-transferValue);
    }
    else {
        // Address A not found, this transaction is invalid
        return ADDRESS_NOT_FOUND;
    }

    // contract state result in JSON format    
    return GetMyContract();
}



EMSCRIPTEN_BINDINGS(module) {
  class_<MyContract>("MyContract")
    .constructor<const std::string&>()
    .function("GetName", &MyContract::GetName)
    .function("GetSupply", &MyContract::GetSupply)
    .function("GetBalance", &MyContract::GetBalance)
    // .function("GetMap2", &MyContract::GetMap2)
    .function("GetMyContract", &MyContract::GetMyContract)
    .function("SetName", &MyContract::SetName)
    .function("SetSupply", &MyContract::SetSupply)
    .function("Add_KeyInt", &MyContract::Add_KeyInt)
    .function("Add_KeyString", &MyContract::Add_KeyString)
    // .function("Add_MemberIntoArray", &MyContract::Add_MemberIntoArray)
    .function("Transfer", &MyContract::Transfer)
    ;
}
